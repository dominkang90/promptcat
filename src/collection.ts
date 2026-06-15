import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { extractionResultSchema, type ExtractionResult } from "./schema.js";

export interface ModuleEntry {
  dir: string; // modules/ 기준 폴더 이름
  imageFile: string; // 예: "image.png"
  result: ExtractionResult;
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

// 폴더 이름 끝의 시간도장(YYYYMMDD-HHMMSS)으로 최신순 정렬하기 위한 키
function stampKey(dir: string): string {
  const m = dir.match(/(\d{8}-\d{6})$/);
  return m ? m[1] : dir;
}

export async function listModules(baseDir: string): Promise<ModuleEntry[]> {
  let names: string[];
  try {
    names = await readdir(baseDir);
  } catch {
    return [];
  }

  const entries: ModuleEntry[] = [];
  for (const name of names) {
    const dir = path.join(baseDir, name);
    try {
      if (!(await stat(dir)).isDirectory()) continue;
    } catch {
      continue;
    }

    let result: ExtractionResult;
    try {
      const raw: unknown = JSON.parse(await readFile(path.join(dir, "prompt.json"), "utf8"));
      const parsed = extractionResultSchema.safeParse(raw);
      if (!parsed.success) continue;
      result = parsed.data;
    } catch {
      continue;
    }

    const files = await readdir(dir);
    const imageFile = files.find((f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase()));
    if (!imageFile) continue;

    entries.push({ dir: name, imageFile, result });
  }

  entries.sort((a, b) => stampKey(b.dir).localeCompare(stampKey(a.dir)));
  return entries;
}
