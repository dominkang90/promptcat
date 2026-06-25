import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extractionResultSchema, type ExtractionResult } from "./schema.js";

export interface ModuleEntry {
  dir: string; // modules/ 기준 폴더 이름
  imageFile: string; // 예: "image.png"
  generatedImages: string[]; // gen-* 로 만든 그림 파일명들
  result: ExtractionResult;
  favorite: boolean;
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

// 폴더 이름 끝의 시간도장(YYYYMMDD-HHMMSS)으로 최신순 정렬하기 위한 키
function stampKey(dir: string): string {
  const m = dir.match(/(\d{8}-\d{6})$/);
  return m ? m[1] : dir;
}

async function readFavorites(baseDir: string): Promise<Set<string>> {
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(baseDir, ".favorites.json"), "utf8"));
    return new Set(Array.isArray(raw) ? (raw as string[]) : []);
  } catch { return new Set(); }
}

// 사용자가 드래그로 바꾼 순서. baseDir/.order.json 에 폴더이름 배열로 저장된다.
async function readOrder(baseDir: string): Promise<string[]> {
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(baseDir, ".order.json"), "utf8"));
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function listModules(baseDir: string): Promise<ModuleEntry[]> {
  let dirents;
  try {
    dirents = await readdir(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const favorites = await readFavorites(baseDir);
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

      entries.push({ dir: ent.name, imageFile, generatedImages, result: parsed.data, favorite: favorites.has(ent.name) });
    } catch {
      continue;
    }
  }

  entries.sort((a, b) => stampKey(b.dir).localeCompare(stampKey(a.dir)));

  // 저장된 수동 순서가 있으면 그대로 따른다. 목록에 없는(새로 생긴) 건 맨 앞(최신).
  const order = await readOrder(baseDir);
  if (order.length) {
    const rank = new Map(order.map((d, i) => [d, i]));
    const inList = entries.filter((e) => rank.has(e.dir)).sort((a, b) => rank.get(a.dir)! - rank.get(b.dir)!);
    const notInList = entries.filter((e) => !rank.has(e.dir)); // 이미 최신순 정렬됨
    return [...notInList, ...inList];
  }
  return entries;
}
