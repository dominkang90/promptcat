import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractPrompt } from "../engine.js";
import type { VisionProvider } from "../providers/types.js";

const goodRaw = {
  imageType: "제품 사진",
  fullPrompt: "warm product shot",
  fixedElements: [{ id: "light", category: "조명", value: "따뜻한 햇살" }],
  variableElements: [
    { id: "subject", category: "주인공", value: "고양이", placeholder: "{{주인공}}" },
  ],
  negativePrompt: "",
  notes: "",
};

function fakeProvider(responses: unknown[]): VisionProvider & { calls: number } {
  return {
    calls: 0,
    async analyze() {
      const out = responses[this.calls] ?? responses[responses.length - 1];
      this.calls += 1;
      return out;
    },
  };
}

let workDir: string;
let imagePath: string;
afterEach(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});
async function makeImage() {
  workDir = await mkdtemp(path.join(tmpdir(), "promptcat-eng-"));
  imagePath = path.join(workDir, "x.png");
  await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
}

describe("extractPrompt", () => {
  it("유효한 응답이면 검증된 결과를 돌려준다", async () => {
    await makeImage();
    const provider = fakeProvider([goodRaw]);
    const result = await extractPrompt(imagePath, provider);
    expect(result.imageType).toBe("제품 사진");
    expect(provider.calls).toBe(1);
  });

  it("처음 응답이 잘못되면 한 번 재시도한다", async () => {
    await makeImage();
    const provider = fakeProvider([{ broken: true }, goodRaw]);
    const result = await extractPrompt(imagePath, provider);
    expect(result.imageType).toBe("제품 사진");
    expect(provider.calls).toBe(2);
  });

  it("계속 잘못되면 에러를 던진다", async () => {
    await makeImage();
    const provider = fakeProvider([{ broken: true }]);
    await expect(extractPrompt(imagePath, provider)).rejects.toThrow();
  });

  it("지원하지 않는 확장자면 어댑터를 부르지 않고 에러를 던진다", async () => {
    const provider = fakeProvider([goodRaw]);
    await expect(extractPrompt("/tmp/file.txt", provider)).rejects.toThrow(/지원하지 않는/);
    expect(provider.calls).toBe(0);
  });
});
