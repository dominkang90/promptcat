import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { aggregateElements, filterElements, elementKey, readElementsMeta, writeElementMeta } from "../elements.js";
import type { ModuleEntry } from "../collection.js";

function mod(dir: string, fixed: [string, string][], variable: [string, string, string][] = []): ModuleEntry {
  return {
    dir, imageFile: "image.png", generatedImages: [],
    result: {
      imageType: "인물", fullPrompt: "", negativePrompt: "", notes: "",
      fixedElements: fixed.map(([category, value], i) => ({ id: "f" + i, category, value })),
      variableElements: variable.map(([category, value, placeholder], i) => ({ id: "v" + i, category, value, placeholder })),
    },
  };
}

describe("aggregateElements", () => {
  it("같은 카테고리·값은 하나로 합치고 출처를 누적한다", () => {
    const mods = [mod("a", [["구도", "정면"]]), mod("b", [["구도", "정면"], ["조명", "역광"]])];
    const list = aggregateElements(mods, {});
    const front = list.find((e) => e.key === elementKey("구도", "정면"))!;
    expect(front.sources.sort()).toEqual(["a", "b"]);
    expect(list.find((e) => e.key === elementKey("조명", "역광"))!.sources).toEqual(["b"]);
  });

  it("변동요소의 placeholder를 보존한다", () => {
    const list = aggregateElements([mod("a", [], [["주인공", "고양이", "{{인물}}"]])], {});
    expect(list[0].placeholder).toBe("{{인물}}");
  });

  it("메타의 favorite/hidden을 반영한다", () => {
    const meta = { [elementKey("구도", "정면")]: { favorite: true, hidden: true, order: 2 } };
    const e = aggregateElements([mod("a", [["구도", "정면"]])], meta)[0];
    expect(e.favorite).toBe(true);
    expect(e.hidden).toBe(true);
    expect(e.order).toBe(2);
  });
});

describe("filterElements", () => {
  const all = [mod("a", [["구도", "정면"], ["조명", "역광"]], [["주인공", "여우", "{{인물}}"]])];
  it("카테고리로 거르고 숨김은 기본 제외, 즐겨찾기 우선 정렬", () => {
    const meta = { [elementKey("조명", "역광")]: { hidden: true } };
    const list = filterElements(aggregateElements(all, meta), { category: "조명" });
    expect(list).toHaveLength(0); // 역광은 숨김
  });
  it("q 부분검색", () => {
    const list = filterElements(aggregateElements(all, {}), { q: "정면" });
    expect(list.map((e) => e.value)).toContain("정면");
    expect(list.map((e) => e.value)).not.toContain("여우");
  });
});

describe("meta 읽기/쓰기", () => {
  let base = "";
  afterEach(async () => { if (base) await rm(base, { recursive: true, force: true }); });
  it("쓰면 다시 읽힌다(부분 패치 병합)", async () => {
    base = await mkdtemp(path.join(tmpdir(), "pc-meta-"));
    await writeElementMeta(base, "구도|정면", { favorite: true });
    await writeElementMeta(base, "구도|정면", { hidden: true });
    const meta = await readElementsMeta(base);
    expect(meta["구도|정면"]).toEqual({ favorite: true, hidden: true });
  });
  it("파일 없으면 빈 객체", async () => {
    base = await mkdtemp(path.join(tmpdir(), "pc-meta-"));
    expect(await readElementsMeta(base)).toEqual({});
  });
});
