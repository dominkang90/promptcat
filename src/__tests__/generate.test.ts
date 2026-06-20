import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateForModule } from "../generate.js";
import type { ImageProvider } from "../image-provider.js";

const good = {
  imageType: "일러스트",
  fullPrompt: "{{캐릭터}} 그림",
  fixedElements: [],
  variableElements: [{ id: "char", category: "주인공", value: "고양이", placeholder: "{{캐릭터}}" }],
  negativePrompt: "",
  notes: "",
};

let base: string;
afterEach(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

class FakeProvider implements ImageProvider {
  public lastPrompt = "";
  async generate(prompt: string) {
    this.lastPrompt = prompt;
    return { data: Buffer.from([1, 2, 3]), mediaType: "image/png" };
  }
}

async function setup() {
  base = await mkdtemp(path.join(tmpdir(), "promptcat-gen-"));
  const dir = path.join(base, "일러스트-20260101-000000");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "prompt.json"), JSON.stringify(good), "utf8");
}

describe("generateForModule", () => {
  it("조립한 프롬프트로 그림을 만들어 모듈 폴더에 저장한다", async () => {
    await setup();
    const provider = new FakeProvider();
    const res = await generateForModule({
      baseDir: base,
      dir: "일러스트-20260101-000000",
      overrides: { char: "강아지" },
      provider,
      now: new Date(2026, 0, 2, 3, 4, 5),
    });

    expect(provider.lastPrompt).toBe("일러스트, 강아지");
    expect(res.files.length).toBe(1);
    expect(res.files[0]).toMatch(/^gen-.*\.png$/);

    const saved = await readdir(path.join(base, "일러스트-20260101-000000"));
    expect(saved).toContain(res.files[0]);
    expect(saved.some((f) => f === "gen-20260102-030405.json")).toBe(true);
  });

  it("count만큼 여러 장 만든다", async () => {
    await setup();
    const res = await generateForModule({
      baseDir: base,
      dir: "일러스트-20260101-000000",
      overrides: {},
      provider: new FakeProvider(),
      count: 3,
      now: new Date(2026, 0, 2, 3, 4, 5),
    });
    expect(res.files.length).toBe(3);
    expect(res.files).toEqual([
      "gen-20260102-030405-1.png",
      "gen-20260102-030405-2.png",
      "gen-20260102-030405-3.png",
    ]);
  });

  it("translate를 주면 번역된 프롬프트로 생성하고 기록한다", async () => {
    await setup();
    const provider = new FakeProvider();
    const res = await generateForModule({
      baseDir: base,
      dir: "일러스트-20260101-000000",
      overrides: { char: "강아지" },
      provider,
      translate: async (t) => `EN(${t})`,
      now: new Date(2026, 0, 2, 3, 4, 5),
    });
    expect(provider.lastPrompt).toBe("EN(일러스트, 강아지)");
    expect(res.prompt).toBe("EN(일러스트, 강아지)");
  });
});
