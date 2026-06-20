import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ModuleEntry } from "./collection.js";

const META_FILE = ".elements-meta.json";

export interface LibraryElement {
  key: string;
  category: string;
  value: string;
  placeholder?: string;
  sources: string[];
  favorite: boolean;
  hidden: boolean;
  order: number;
}
export type ElementMeta = Record<string, { favorite?: boolean; hidden?: boolean; order?: number }>;

export function elementKey(category: string, value: string): string {
  return `${category}|${value}`;
}

export async function readElementsMeta(baseDir: string): Promise<ElementMeta> {
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(baseDir, META_FILE), "utf8"));
    return raw && typeof raw === "object" ? (raw as ElementMeta) : {};
  } catch {
    return {};
  }
}

export async function writeElementMeta(
  baseDir: string,
  key: string,
  patch: { favorite?: boolean; hidden?: boolean; order?: number },
): Promise<void> {
  const meta = await readElementsMeta(baseDir);
  meta[key] = { ...meta[key], ...patch };
  await writeFile(path.join(baseDir, META_FILE), JSON.stringify(meta, null, 2), "utf8");
}

export function aggregateElements(modules: ModuleEntry[], meta: ElementMeta): LibraryElement[] {
  const map = new Map<string, LibraryElement>();
  for (const m of modules) {
    const all: { category: string; value: string; placeholder?: string }[] = [
      ...m.result.fixedElements.map((e) => ({ category: e.category, value: e.value })),
      ...m.result.variableElements.map((e) => ({ category: e.category, value: e.value, placeholder: e.placeholder })),
    ];
    for (const e of all) {
      const key = elementKey(e.category, e.value);
      const existing = map.get(key);
      if (existing) {
        if (!existing.sources.includes(m.dir)) existing.sources.push(m.dir);
      } else {
        const mm = meta[key] ?? {};
        map.set(key, {
          key,
          category: e.category,
          value: e.value,
          placeholder: e.placeholder,
          sources: [m.dir],
          favorite: mm.favorite ?? false,
          hidden: mm.hidden ?? false,
          order: mm.order ?? Number.MAX_SAFE_INTEGER,
        });
      }
    }
  }
  return [...map.values()];
}

export interface ListElementsQuery {
  category?: string;
  q?: string;
  includeHidden?: boolean;
}

export function filterElements(all: LibraryElement[], query: ListElementsQuery): LibraryElement[] {
  let list = all;
  if (query.category) list = list.filter((e) => e.category === query.category);
  if (query.q) {
    const q = query.q.toLowerCase();
    list = list.filter((e) => e.value.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
  }
  if (!query.includeHidden) list = list.filter((e) => !e.hidden);
  return [...list].sort(
    (a, b) =>
      Number(b.favorite) - Number(a.favorite) || a.order - b.order || a.value.localeCompare(b.value),
  );
}
