import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractionResultSchema } from "./schema.js";
import { assemblePrompt } from "./prompt-assembly.js";
import { formatStamp } from "./storage.js";
import type { ImageProvider } from "./image-provider.js";

const EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export interface GenerateResult {
  files: string[]; // 모듈 폴더 기준 저장된 파일명들
  prompt: string;
}

export async function generateForModule(opts: {
  baseDir: string;
  dir: string;
  overrides: Record<string, string>;
  provider: ImageProvider;
  count?: number;
  now?: Date;
}): Promise<GenerateResult> {
  const moduleDir = path.join(opts.baseDir, opts.dir);
  const raw: unknown = JSON.parse(await readFile(path.join(moduleDir, "prompt.json"), "utf8"));
  const result = extractionResultSchema.parse(raw);
  const prompt = assemblePrompt(result, opts.overrides);

  const count = Math.min(Math.max(opts.count ?? 1, 1), 4);
  const s = formatStamp(opts.now ?? new Date());
  const files: string[] = [];

  for (let i = 1; i <= count; i++) {
    const img = await opts.provider.generate(prompt);
    const ext = EXT[img.mediaType] ?? ".png";
    const name = count === 1 ? `gen-${s}${ext}` : `gen-${s}-${i}${ext}`;
    await writeFile(path.join(moduleDir, name), img.data);
    files.push(name);
  }

  // 한 번의 생성 기록(공유): 쓴 프롬프트·바꾼 값·파일 목록
  await writeFile(
    path.join(moduleDir, `gen-${s}.json`),
    JSON.stringify({ prompt, overrides: opts.overrides, files }, null, 2),
    "utf8",
  );

  return { files, prompt };
}
