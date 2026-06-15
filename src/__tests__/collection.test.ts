import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listModules } from "../collection.js";

const good = {
  imageType: "제품",
  fullPrompt: "warm shot",
  fixedElements: [{ id: "l", category: "조명", value: "햇살" }],
  variableElements: [{ id: "s", category: "주인공", value: "고양이", placeholder: "{{주인공}}" }],
  negativePrompt: "",
  notes: "",
};

let base: string;
afterEach(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

async function makeModule(dir: string, withImage = true, json: unknown = good) {
  const d = path.join(base, dir);
  await mkdir(d, { recursive: true });
  if (json !== undefined && json !== null) await writeFile(path.join(d, "prompt.json"), JSON.stringify(json), "utf8");
  if (withImage) await writeFile(path.join(d, "image.png"), Buffer.from([0x89, 0x50]));
}

describe("listModules", () => {
  it("폴더가 없으면 빈 배열", async () => {
    expect(await listModules("/tmp/promptcat-nope-xyz")).toEqual([]);
  });

  it("유효한 모듈만, 최신 시간순으로 돌려준다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-col-"));
    await makeModule("일러스트-20260616-035841");
    await makeModule("제품-20260616-040114");
    await makeModule("깨진폴더-20260616-050000", true, null); // prompt.json 없음
    await makeModule("이미지없음-20260616-060000", false); // 이미지 없음
    const list = await listModules(base);
    expect(list.length).toBe(2);
    expect(list[0].dir).toBe("제품-20260616-040114"); // 040114 > 035841
    expect(list[0].imageFile).toBe("image.png");
    expect(list[0].result.imageType).toBe("제품");
  });
});
