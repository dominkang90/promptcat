# 프롬프트 요소 수집기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 갤러리에서 모든 프롬프트의 요소를 모아 검색·즐겨찾기·숨김·재사용하고, 이미지 클릭으로 요소를 편집·교체할 수 있게 한다.

**Architecture:** 새 DB 없이 기존 `modules/*/prompt.json`을 집계해 "요소 창고"로 쓴다. 요소가 source-of-truth가 되어 생성 프롬프트는 요소 값을 이어붙여 조립한다(`assemblePrompt` 교체). 즐겨찾기/숨김/순서만 `modules/.elements-meta.json` 사이드카에 저장. 백엔드(데이터·라우트)와 프론트(gallery.ts UI)를 2갈래 병렬로 만들고, 둘 사이 계약은 아래 "공유 계약"으로 고정한다.

**Tech Stack:** TypeScript ESM, Node http, zod, vitest. 네트워크는 테스트에서 주입.

## Global Constraints

- 메인 브랜치 `master`, 원격 없음 — 커밋이 곧 배포.
- 검사: `npm run typecheck`, `npm test`(vitest) 모두 통과해야 함.
- 외부 호출(provider/translate/fetch)은 테스트에서 주입해 실제 네트워크를 타지 않는다.
- 라우트는 기존 패턴(수동 라우팅, JSON 응답, `root` 경로 탈출 거부) 그대로 따른다.
- 요소 정체성 키 = `` `${category}|${value}` ``.
- 파일 경로는 항상 정확히. 작은·집중된 파일 선호(집계/메타는 새 파일 `src/elements.ts`).

---

## 공유 계약 (먼저 고정 — A·B 둘 다 이 시그니처를 신뢰)

```ts
// src/elements.ts
export interface LibraryElement {
  key: string;          // `${category}|${value}`
  category: string;
  value: string;
  placeholder?: string; // 변동요소면 존재
  sources: string[];    // 등장한 module dir 목록
  favorite: boolean;
  hidden: boolean;
  order: number;        // 메타 순서(없으면 매우 큰 수)
}
export type ElementMeta = Record<string, { favorite?: boolean; hidden?: boolean; order?: number }>;
export function elementKey(category: string, value: string): string;
export async function readElementsMeta(baseDir: string): Promise<ElementMeta>;
export async function writeElementMeta(baseDir: string, key: string, patch: { favorite?: boolean; hidden?: boolean; order?: number }): Promise<void>;
export function aggregateElements(modules: ModuleEntry[], meta: ElementMeta): LibraryElement[];
export interface ListElementsQuery { category?: string; q?: string; includeHidden?: boolean }
export function filterElements(all: LibraryElement[], query: ListElementsQuery): LibraryElement[];
export async function updateModuleElements(baseDir: string, dir: string, fixedElements: FixedElement[], variableElements: VariableElement[]): Promise<void>;
```

**라우트 계약 (gallery-server.ts):**
- `GET /api/elements?category=&q=&includeHidden=` → `200 LibraryElement[]` (숨김 기본 제외)
- `POST /api/elements/meta` body `{key, favorite?, hidden?, order?}` → `200 {ok:true}`
- `POST /api/module/update` body `{dir, fixedElements, variableElements}` → `200 {ok:true}` / 경로탈출 `403`

**조립 계약 (prompt-assembly.ts):**
- `assemblePrompt(result, overrides)` = `[imageType, ...고정요소 value, ...변동요소(override 적용) value].join(", ")` (빈 값 제외)

---

# Stream A — 백엔드·데이터 (`src/elements.ts`, `prompt-assembly.ts`, `gallery-server.ts`)

## Task A1: 요소 집계 + 메타 (`src/elements.ts`)

**Files:**
- Create: `src/elements.ts`
- Test: `src/__tests__/elements.test.ts`

**Interfaces:**
- Consumes: `ModuleEntry`(collection.ts), `FixedElement`/`VariableElement`(schema.ts)
- Produces: 공유 계약의 `elements.ts` 전체(updateModuleElements는 Task A3)

- [ ] **Step 1: 실패 테스트 작성** — `src/__tests__/elements.test.ts`

```ts
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
```

- [ ] **Step 2: 실패 확인** — `npm test -- elements` → FAIL (`Cannot find module '../elements.js'`)

- [ ] **Step 3: 구현** — `src/elements.ts`

```ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ModuleEntry } from "./collection.js";
import type { FixedElement, VariableElement } from "./schema.js";

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
```

- [ ] **Step 4: 통과 확인** — `npm test -- elements` → PASS

- [ ] **Step 5: 커밋**

```bash
git add src/elements.ts src/__tests__/elements.test.ts
git commit -m "feat: 요소 집계·메타 사이드카(elements.ts)"
```

## Task A2: 요소 기반 조립 (`prompt-assembly.ts` 교체)

**Files:**
- Modify: `src/prompt-assembly.ts`
- Modify: `src/__tests__/prompt-assembly.test.ts`

**Interfaces:**
- Produces: `assemblePrompt(result, overrides)` — 조립 계약대로 element-based

- [ ] **Step 1: 테스트 교체** — `src/__tests__/prompt-assembly.test.ts` 전체를 아래로 교체

```ts
import { describe, it, expect } from "vitest";
import { assemblePrompt } from "../prompt-assembly.js";
import type { ExtractionResult } from "../schema.js";

const result: ExtractionResult = {
  imageType: "인물",
  fullPrompt: "(원본 메모는 생성에 안 쓰임)",
  fixedElements: [
    { id: "comp", category: "구도", value: "정면 대칭" },
    { id: "light", category: "조명", value: "부드러운 정면광" },
  ],
  variableElements: [
    { id: "subject", category: "주인공", value: "고양이", placeholder: "{{인물}}" },
  ],
  negativePrompt: "",
  notes: "",
};

describe("assemblePrompt (요소 조립)", () => {
  it("imageType + 고정 + 변동 값을 순서대로 이어붙인다", () => {
    expect(assemblePrompt(result, {})).toBe("인물, 정면 대칭, 부드러운 정면광, 고양이");
  });
  it("변동요소 override가 적용된다", () => {
    expect(assemblePrompt(result, { subject: "여우" })).toBe("인물, 정면 대칭, 부드러운 정면광, 여우");
  });
  it("공백 override는 저장된 값으로 채운다", () => {
    expect(assemblePrompt(result, { subject: "   " })).toBe("인물, 정면 대칭, 부드러운 정면광, 고양이");
  });
  it("빈 값 요소는 건너뛴다", () => {
    const r = { ...result, fixedElements: [{ id: "x", category: "배경", value: "" }] };
    expect(assemblePrompt(r, {})).toBe("인물, 고양이");
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- prompt-assembly` → FAIL

- [ ] **Step 3: 구현 교체** — `src/prompt-assembly.ts`

```ts
import type { ExtractionResult } from "./schema.js";

// 요소가 source-of-truth: imageType + 고정요소 + 변동요소(override 적용) 값을 이어붙인다.
// fullPrompt(줄글)는 "원본 메모"일 뿐 생성에 쓰지 않는다.
export function assemblePrompt(
  result: ExtractionResult,
  overrides: Record<string, string> = {},
): string {
  const parts: string[] = [];
  const push = (v: string) => {
    const t = (v ?? "").trim();
    if (t) parts.push(t);
  };
  push(result.imageType);
  for (const el of result.fixedElements) push(el.value);
  for (const el of result.variableElements) {
    const raw = overrides[el.id];
    push(raw !== undefined && raw.trim() !== "" ? raw : el.value);
  }
  return parts.join(", ");
}
```

- [ ] **Step 4: 통과 확인** — `npm test -- prompt-assembly` → PASS, 이어서 `npm test`로 전체 회귀 확인(generate 테스트가 조립 문자열을 기대하면 함께 갱신)

- [ ] **Step 5: 커밋**

```bash
git add src/prompt-assembly.ts src/__tests__/prompt-assembly.test.ts
git commit -m "feat: 생성 프롬프트를 요소 기반 조립으로 전환"
```

## Task A3: 모듈 요소 저장 (`updateModuleElements`)

**Files:**
- Modify: `src/elements.ts`
- Modify: `src/__tests__/elements.test.ts`

**Interfaces:**
- Consumes: `extractionResultSchema`, `FixedElement`, `VariableElement`
- Produces: `updateModuleElements(baseDir, dir, fixedElements, variableElements): Promise<void>`

- [ ] **Step 1: 실패 테스트 추가** — `elements.test.ts` 끝에

```ts
import { mkdir } from "node:fs/promises";
import { updateModuleElements } from "../elements.js";

describe("updateModuleElements", () => {
  let base = "";
  afterEach(async () => { if (base) await rm(base, { recursive: true, force: true }); });
  it("prompt.json의 요소 배열을 통째로 바꿔 저장한다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "pc-upd-"));
    const dir = "인물-20260101-000000";
    await mkdir(path.join(base, dir), { recursive: true });
    const orig = { imageType: "인물", fullPrompt: "원본", fixedElements: [], variableElements: [], negativePrompt: "", notes: "메모" };
    await writeFile(path.join(base, dir, "prompt.json"), JSON.stringify(orig), "utf8");

    await updateModuleElements(base, dir,
      [{ id: "f0", category: "구도", value: "로우앵글" }],
      [{ id: "v0", category: "주인공", value: "강아지", placeholder: "{{인물}}" }],
    );

    const saved = JSON.parse(await readFile(path.join(base, dir, "prompt.json"), "utf8"));
    expect(saved.fixedElements[0].value).toBe("로우앵글");
    expect(saved.variableElements[0].value).toBe("강아지");
    expect(saved.imageType).toBe("인물"); // 나머지 필드 보존
    expect(saved.notes).toBe("메모");
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- elements` → FAIL

- [ ] **Step 3: 구현 추가** — `src/elements.ts` 끝에

```ts
import { extractionResultSchema, type FixedElement, type VariableElement } from "./schema.js";

export async function updateModuleElements(
  baseDir: string,
  dir: string,
  fixedElements: FixedElement[],
  variableElements: VariableElement[],
): Promise<void> {
  const file = path.join(baseDir, dir, "prompt.json");
  const current = extractionResultSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const updated = extractionResultSchema.parse({ ...current, fixedElements, variableElements });
  await writeFile(file, JSON.stringify(updated, null, 2), "utf8");
}
```

(주의: 위 `import`는 파일 상단 import 영역으로 합칠 것. `FixedElement`/`VariableElement` 타입도 상단에서 가져오면 중복 제거.)

- [ ] **Step 4: 통과 확인** — `npm test -- elements` → PASS

- [ ] **Step 5: 커밋**

```bash
git add src/elements.ts src/__tests__/elements.test.ts
git commit -m "feat: updateModuleElements로 편집된 요소 저장"
```

## Task A4: 서버 라우트 3개 (`gallery-server.ts`)

**Files:**
- Modify: `src/gallery-server.ts` (import 추가, `/reorder` 블록 뒤에 라우트 3개 추가)
- Modify: `src/__tests__/gallery-server.test.ts`

**Interfaces:**
- Consumes: `listModules`, `aggregateElements`, `filterElements`, `readElementsMeta`, `writeElementMeta`, `updateModuleElements`
- Produces: 라우트 계약의 3개 엔드포인트

- [ ] **Step 1: 실패 테스트 추가** — `gallery-server.test.ts`에 새 it 추가 (setup 헬퍼 재사용)

```ts
it("/api/elements 는 집계된 요소를, /api/module/update 는 저장을 한다", async () => {
  await setup(); // product-... 모듈 1개(요소 없음) 존재
  const server = createGalleryServer(base);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  try {
    // 요소 추가 저장
    const upd = await fetch(`http://localhost:${port}/api/module/update`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ dir: "product-20260101-000000", fixedElements: [{ id: "f0", category: "구도", value: "정면" }], variableElements: [] }),
    });
    expect(upd.status).toBe(200);

    // 집계 조회
    const list = await (await fetch(`http://localhost:${port}/api/elements?category=구도`)).json();
    expect(list.map((e: { value: string }) => e.value)).toContain("정면");

    // 메타: 숨김 처리하면 기본 조회에서 빠진다
    await fetch(`http://localhost:${port}/api/elements/meta`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "구도|정면", hidden: true }),
    });
    const after = await (await fetch(`http://localhost:${port}/api/elements?category=구도`)).json();
    expect(after).toHaveLength(0);
  } finally {
    server.close();
  }
});

it("/api/module/update 경로 탈출은 403", async () => {
  await setup();
  const server = createGalleryServer(base);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  try {
    const r = await fetch(`http://localhost:${port}/api/module/update`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ dir: "../escape", fixedElements: [], variableElements: [] }),
    });
    expect(r.status).toBe(403);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- gallery-server` → FAIL (404/500)

- [ ] **Step 3: 구현** — `gallery-server.ts` 상단 import에 추가
```ts
import { aggregateElements, filterElements, readElementsMeta, writeElementMeta, updateModuleElements } from "./elements.js";
```
그리고 `/reorder` 블록 바로 뒤에 추가:

```ts
      if (req.method === "GET" && url.pathname === "/api/elements") {
        const meta = await readElementsMeta(baseDir);
        const all = aggregateElements(await listModules(baseDir), meta);
        const list = filterElements(all, {
          category: url.searchParams.get("category") ?? undefined,
          q: url.searchParams.get("q") ?? undefined,
          includeHidden: url.searchParams.get("includeHidden") === "1",
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(list));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/elements/meta") {
        const { key, favorite, hidden, order } = JSON.parse(await readBody(req)) as {
          key: string; favorite?: boolean; hidden?: boolean; order?: number;
        };
        await writeElementMeta(baseDir, key, { favorite, hidden, order });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/module/update") {
        try {
          const { dir, fixedElements, variableElements } = JSON.parse(await readBody(req)) as {
            dir: string; fixedElements: unknown[]; variableElements: unknown[];
          };
          const full = path.resolve(root, dir);
          if (full === root || !full.startsWith(root + path.sep)) {
            res.writeHead(403, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "forbidden" }));
            return;
          }
          await updateModuleElements(baseDir, dir, fixedElements as never, variableElements as never);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
        return;
      }
```

- [ ] **Step 4: 통과 확인** — `npm test -- gallery-server` → PASS, 그리고 `npm run typecheck` → 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src/gallery-server.ts src/__tests__/gallery-server.test.ts
git commit -m "feat: 요소 라이브러리·저장 라우트(/api/elements, /api/elements/meta, /api/module/update)"
```

---

# Stream B — 화면 (`src/gallery.ts`)

> Stream A의 라우트 계약만 신뢰하면 됨. A 완성 전이라도 mock 응답으로 UI를 먼저 만들 수 있다.
> 이 코드베이스의 프론트는 `gallery.ts`가 만드는 HTML 문자열 + 인라인 바닐라 JS다. 단위테스트는 `renderGallery` 출력에 필요한 마크업/함수가 들어있는지 확인하고, 상호작용은 브라우저로 검증한다.

## Task B1: 편집 팝업 — 요소 편집·저장·순서변경

**Files:**
- Modify: `src/gallery.ts` (`openDetail` 확장, 스타일·헬퍼 추가)
- Modify: `src/__tests__/gallery.test.ts`

**Interfaces:**
- Consumes: 라우트 `POST /api/module/update` (`{dir, fixedElements, variableElements}`)
- Produces: 클라이언트 함수 `editElement`, `saveModule` (B2가 `openPicker` 결과를 여기에 주입)

- [ ] **Step 1: 마크업 테스트 추가** — `gallery.test.ts`에

```ts
it("편집 저장·요소편집 JS 훅이 렌더링된다", () => {
  const html = renderGallery([]); // 빈 갤러리여도 스크립트는 포함
  expect(html).toContain("function saveModule");
  expect(html).toContain("function editElement");
  expect(html).toContain("/api/module/update");
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- gallery.test` → FAIL

- [ ] **Step 3: 구현** — `openDetail`에서 고정요소를 읽기전용 `addRow` 대신 **편집 가능한 요소 카드**로 렌더. 각 카드: 값 표시 + [✏️수정][🔄가져오기][🗑️삭제]. 수정 시 `<input>`으로 전환. 변동요소도 동일 카드(placeholder 뱃지 표시). 하단 [💾 저장] 버튼 → 현재 카드들에서 fixed/variable 배열을 재구성해 `POST /api/module/update`. 드래그로 카드 순서변경(같은 그룹 내). 핵심 클라이언트 코드(스크립트 영역에 추가):

```js
// 편집 팝업의 요소 상태(열 때 MODULES[i]에서 복제)
let EDIT = null; // { dir, fixed:[{id,category,value}], variable:[{id,category,value,placeholder}] }

function elCard(group, idx) {
  const e = EDIT[group][idx];
  const card = document.createElement("div");
  card.className = "elcard"; card.draggable = true;
  card.dataset.group = group; card.dataset.idx = idx;
  card.innerHTML =
    '<div class="elcat">' + escapeHtmlJs(e.category) + (group === "variable" ? ' <span class="ph">' + escapeHtmlJs(e.placeholder || "") + "</span>" : "") + "</div>" +
    '<div class="elval">' + escapeHtmlJs(e.value) + "</div>" +
    '<div class="elbtns"><button data-a="edit">✏️</button><button data-a="pick">🔄</button><button data-a="del">🗑️</button></div>";
  card.querySelector('[data-a=edit]').onclick = function () { editElement(group, idx, card); };
  card.querySelector('[data-a=del]').onclick = function () { EDIT[group].splice(idx, 1); renderEdit(); };
  card.querySelector('[data-a=pick]').onclick = function () { openPicker(e.category, group, idx); };
  return card;
}

function editElement(group, idx, card) {
  const inp = document.createElement("input");
  inp.className = "eledit"; inp.value = EDIT[group][idx].value;
  inp.onkeydown = function (ev) { if (ev.key === "Enter") commit(); };
  inp.onblur = commit;
  function commit() { EDIT[group][idx].value = inp.value; renderEdit(); }
  card.querySelector(".elval").replaceWith(inp); inp.focus();
}

function renderEdit() {
  const box = document.getElementById("elbox");
  if (!box) return;
  box.innerHTML = "";
  EDIT.fixed.forEach(function (_, i) { box.appendChild(elCard("fixed", i)); });
  EDIT.variable.forEach(function (_, i) { box.appendChild(elCard("variable", i)); });
  wireElDrag(box);
}

function saveModule() {
  fetch("/api/module/update", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ dir: EDIT.dir, fixedElements: EDIT.fixed, variableElements: EDIT.variable }),
  }).then(function (r) { return r.json(); })
    .then(function (d) { alert(d && d.ok ? "저장됐어요 😺" : "저장 실패 😿"); })
    .catch(function () { alert("저장 실패 😿"); });
}
```
- `escapeHtmlJs`는 클라이언트용 escape 헬퍼(없으면 추가). `openDetail(i)`에서 `EDIT = {dir, fixed: 복제, variable: 복제}` 설정 후 `renderEdit()` 호출, 컨테이너 `<div id="elbox">`와 [💾 저장] 버튼을 sheet에 추가. `wireElDrag`은 같은 group 내 카드 드래그로 `EDIT[group]` 배열 순서를 바꾸고 `renderEdit()`.
- `openPicker(category, group, idx)`는 B2가 정의. B1에서는 빈 함수 stub `function openPicker(){}`로 두고 B2에서 채운다.

- [ ] **Step 4: 통과 확인** — `npm test -- gallery.test` → PASS, `npm run typecheck` 통과

- [ ] **Step 5: 커밋**

```bash
git add src/gallery.ts src/__tests__/gallery.test.ts
git commit -m "feat: 편집 팝업에서 요소 수정·삭제·순서변경·저장"
```

## Task B2: 라이브러리 피커 — 카테고리별 출처 이미지 + 검색·즐겨찾기·숨김

**Files:**
- Modify: `src/gallery.ts` (`openPicker` 구현, 피커 모달 마크업·스타일)
- Modify: `src/__tests__/gallery.test.ts`

**Interfaces:**
- Consumes: `GET /api/elements?category=&q=`, `POST /api/elements/meta`
- Produces: `openPicker(category, group, idx)` — 고른 요소를 `EDIT[group][idx]`에 넣고(없으면 push) `renderEdit()`

- [ ] **Step 1: 마크업 테스트 추가** — `gallery.test.ts`에

```ts
it("라이브러리 피커 JS 훅이 렌더링된다", () => {
  const html = renderGallery([]);
  expect(html).toContain("function openPicker");
  expect(html).toContain("/api/elements?category=");
  expect(html).toContain("/api/elements/meta");
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- gallery.test` → FAIL

- [ ] **Step 3: 구현** — 피커 모달(`<div id="picker">`)을 편집 팝업 위에 겹쳐 띄움. `openPicker`:

```js
function openPicker(category, group, idx) {
  const pk = document.getElementById("picker");
  const body = document.getElementById("pickerBody");
  document.getElementById("pickerTitle").textContent = category + " 요소 고르기";
  let q = "";
  function load() {
    fetch("/api/elements?category=" + encodeURIComponent(category) + "&q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (list) {
        body.innerHTML = "";
        list.forEach(function (el) {
          const item = document.createElement("div"); item.className = "pkitem"; item.title = el.value;
          const thumb = el.sources && el.sources[0]
            ? '<img src="/img/' + encodeURIComponent(el.sources[0]) + '/__first__" onerror="this.style.visibility=\'hidden\'">'
            : "";
          item.innerHTML =
            '<div class="pkthumbs">' + (el.sources || []).slice(0, 4).map(function (s) {
              return '<span class="pkdir">' + escapeHtmlJs(s) + "</span>"; }).join("") + "</div>" +
            '<div class="pkval">' + escapeHtmlJs(el.value) + "</div>" +
            '<div class="pkbtns"><button data-a="fav">' + (el.favorite ? "★" : "☆") + '</button><button data-a="hide">👁</button><button data-a="use">사용</button></div>";
          item.querySelector('[data-a=use]').onclick = function () { choose(el); };
          item.querySelector('[data-a=fav]').onclick = function () { meta(el.key, { favorite: !el.favorite }); };
          item.querySelector('[data-a=hide]').onclick = function () { meta(el.key, { hidden: true }); };
          body.appendChild(item);
        });
      });
  }
  function meta(key, patch) {
    fetch("/api/elements/meta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ key: key }, patch)) })
      .then(load);
  }
  function choose(el) {
    const target = EDIT[group][idx];
    if (target) { target.value = el.value; if (el.placeholder) target.placeholder = el.placeholder; }
    else EDIT[group].push({ id: "new-" + Date.now(), category: category, value: el.value, placeholder: el.placeholder || "" });
    pk.classList.remove("open"); renderEdit();
  }
  document.getElementById("pickerSearch").oninput = function () { q = this.value; load(); };
  document.getElementById("pickerSearch").value = "";
  pk.classList.add("open"); load();
}
```
- 마크업: `header` 아래 어딘가에 피커 모달 컨테이너 추가 — `<div class="modal" id="picker"><div class="sheet"><button class="close" onclick="document.getElementById('picker').classList.remove('open')">×</button><h2 id="pickerTitle"></h2><input id="pickerSearch" placeholder="🔍 검색"><div id="pickerBody"></div></div></div>`.
- 썸네일 라우트가 없으면(출처 이미지의 대표 파일명이 불명) `el.sources`의 dir 텍스트 배지로 먼저 표시하고, 이미지 썸네일은 후속 개선으로 둔다(YAGNI). 호버 요약은 `item.title = el.value`로 제공.
- "사용(use)" 또는 항목 클릭 시 `choose` → 같은 카테고리 슬롯 교체(없으면 추가).

- [ ] **Step 4: 통과 확인** — `npm test -- gallery.test` → PASS, `npm run typecheck` 통과

- [ ] **Step 5: 커밋**

```bash
git add src/gallery.ts src/__tests__/gallery.test.ts
git commit -m "feat: 라이브러리 피커(카테고리별 검색·즐겨찾기·숨김·요소 가져오기)"
```

---

# 통합 (메인 담당)

- [ ] A·B 합친 뒤 `npm run typecheck` + `npm test` 전부 통과 확인.
- [ ] 갤러리 실행(`npm run gallery`, 4517) → 브라우저로 확인:
  - 이미지 클릭 → 편집 팝업, 고정요소 수정·삭제·드래그·저장 동작
  - 요소의 🔄 → 카테고리 피커, 검색·★·👁 동작, "사용" 시 교체/추가
  - 저장 후 새 요소로 🎨 생성 시 조립 프롬프트 반영
- [ ] 사용자 승인 후 master 커밋(이미 작은 커밋들은 각 Task에서 됨).

---

## Self-Review 메모

- 스펙 커버리지: 고정요소 편집(B1) ✓, 요소 창고·재사용(A1·B2) ✓, 출처 이미지 목록+호버 요약(B2, 이미지 썸네일은 배지+title로 시작) ✓, 카테고리만 표시(B2 category 필터) ✓, 검색·즐겨찾기·숨김·순서(A1·A4·B2) ✓, 편집 팝업 좌이미지·우프롬프트(B1) ✓, 조립 전환(A2) ✓.
- 타입 일관성: `LibraryElement`·라우트 바디·`EDIT` 구조가 공유 계약과 일치.
- 알려진 축소(YAGNI): 피커의 출처 "이미지 썸네일"은 1단계에서 dir 배지 + `title` 호버로 시작(이미지 파일 썸네일 라우트는 후속). 요소 순서변경은 같은 그룹(fixed/variable) 내에서만.
