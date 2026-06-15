import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveModule } from "../storage.js";
import type { ExtractionResult } from "../schema.js";

const result: ExtractionResult = {
  imageType: "제품 사진",
  fullPrompt: "warm product shot",
  fixedElements: [{ id: "light", category: "조명", value: "따뜻한 햇살" }],
  variableElements: [
    { id: "subject", category: "주인공", value: "고양이", placeholder: "{{주인공}}" },
  ],
  negativePrompt: "",
  notes: "",
};

let workDir: string;
afterEach(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe("saveModule", () => {
  it("사진/json/md 3개 파일을 모듈 폴더에 만든다", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "promptcat-"));
    const imagePath = path.join(workDir, "src.png");
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const dir = await saveModule({
      imagePath,
      result,
      baseDir: path.join(workDir, "modules"),
      slug: "테스트",
      now: new Date("2026-06-15T01:02:03"),
    });

    expect(dir).toContain("테스트-20260615-010203");
    const json = JSON.parse(await readFile(path.join(dir, "prompt.json"), "utf8"));
    expect(json.imageType).toBe("제품 사진");
    const md = await readFile(path.join(dir, "prompt.md"), "utf8");
    expect(md).toContain("제품 사진");
    const img = await readFile(path.join(dir, "image.png"));
    expect(img.length).toBe(4);
  });
});
