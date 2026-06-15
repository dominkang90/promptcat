import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import type { ExtractionResult } from "./schema.js";
import { renderMarkdown } from "./markdown.js";

export interface SaveModuleInput {
  imagePath: string;
  result: ExtractionResult;
  baseDir: string;
  slug?: string;
  now?: Date;
}

export async function saveModule(input: SaveModuleInput): Promise<string> {
  const slug = input.slug ?? slugify(input.result.imageType);
  const stamp = formatStamp(input.now ?? new Date());
  const dir = path.join(input.baseDir, `${slug}-${stamp}`);
  await mkdir(dir, { recursive: true });

  const ext = path.extname(input.imagePath) || ".png";
  await copyFile(input.imagePath, path.join(dir, `image${ext}`));
  await writeFile(path.join(dir, "prompt.json"), JSON.stringify(input.result, null, 2), "utf8");
  await writeFile(path.join(dir, "prompt.md"), renderMarkdown(input.result), "utf8");

  return dir;
}

function slugify(s: string): string {
  return (
    s.trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 40) || "module"
  );
}

function formatStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}
