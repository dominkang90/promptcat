import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extractionResultSchema, type ExtractionResult } from "./schema.js";

export interface ModuleEntry {
  dir: string; // modules/ 기준 폴더 이름
  imageFile: string; // 예: "image.png"
  generatedImages: string[]; // gen-* 로 만든 그림 파일명들
  result: ExtractionResult;
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

// 폴더 이름 끝의 시간도장(YYYYMMDD-HHMMSS)으로 최신순 정렬하기 위한 키
function stampKey(dir: string): string {
  const m = dir.match(/(\d{8}-\d{6})$/);
  return m ? m[1] : dir;
}

export async function listModules(baseDir: string): Promise<ModuleEntry[]> {
  let dirents;
  try {
    dirents = await readdir(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const entries: ModuleEntry[] = [];
  for (const ent of dirents) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(baseDir, ent.name);

    try {
      const raw: unknown = JSON.parse(await readFile(path.join(dir, "prompt.json"), "utf8"));
      const parsed = extractionResultSchema.safeParse(raw);
      if (!parsed.success) continue;

      const files = await readdir(dir);
      const images = files.filter((f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase()));
      const imageFile = images.find((f) => !f.startsWith("gen-")) ?? images[0];
      if (!imageFile) continue;
      const generatedImages = images.filter((f) => f.startsWith("gen-")).sort();

      entries.push({ dir: ent.name, imageFile, generatedImages, result: parsed.data });
    } catch {
      continue;
    }
  }

  entries.sort((a, b) => stampKey(b.dir).localeCompare(stampKey(a.dir)));
  return entries;
}
