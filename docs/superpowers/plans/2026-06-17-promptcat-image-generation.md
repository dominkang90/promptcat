# 이미지 생성 + 설정 패널(D단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 갤러리 상세창에서 변동 요소를 바꿔 Gemini로 그림을 만들어 모듈 폴더에 저장하고, 고양이 우클릭 "⚙️ 설정"으로 키 등 옵션을 웹에서 바꾼다.

**Architecture:** 순수 함수(프롬프트 조립·HTML 렌더)와 부수효과(파일·네트워크) 단위를 분리한다. 설정은 `promptcat-config.json` 한 파일에 모으고, 기존 로컬 서버에 `POST /generate`·설정 라우트를 더한다. 이미지 생성기는 `fetch`를 주입할 수 있게 만들어 진짜 호출 없이 테스트한다.

**Tech Stack:** TypeScript(ESM, NodeNext) · Node 내장 `http`/`fs` · zod · vitest · tsx · Google Gemini REST(`gemini-2.5-flash-image`)

---

## 시작 전

```bash
cd /home/rkdtk/promptcat
git checkout feat/image-generation   # 이미 이 가지에 스펙 커밋됨
```

## 파일 구조

- Create: `src/config.ts` — `promptcat-config.json` 읽기/쓰기 + 키 마스킹
- Create: `src/__tests__/config.test.ts`
- Create: `src/prompt-assembly.ts` — `assemblePrompt` 순수 함수
- Create: `src/__tests__/prompt-assembly.test.ts`
- Create: `src/image-provider.ts` — `GeminiImageProvider` + 요청/응답 헬퍼
- Create: `src/__tests__/image-provider.test.ts`
- Create: `src/generate.ts` — `generateForModule` (조립→생성→저장)
- Create: `src/__tests__/generate.test.ts`
- Modify: `src/collection.ts` — `ModuleEntry.generatedImages` 추가
- Modify: `src/__tests__/collection.test.ts`, `src/__tests__/gallery.test.ts` (타입 보정)
- Modify: `src/gallery-server.ts` — `POST /generate`, 설정 라우트, provider 주입
- Modify: `src/__tests__/gallery-server.test.ts`
- Create: `src/gallery-settings.ts` — `renderSettings` 순수 함수
- Create: `src/__tests__/gallery-settings.test.ts`
- Modify: `src/gallery.ts` — 상세창 입력칸 + 🎨 버튼 + gen 스트립
- Create/Modify: `.gitignore` — `promptcat-config.json`
- Modify: `/mnt/c/Users/rkdtk/promptcat-launcher/cat.pyw` — "⚙️ 설정" 메뉴 (깃 밖)

---

### Task 1: 설정 저장소 (`config.ts`)

**Files:**
- Create: `src/config.ts`
- Test: `src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/config.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, saveConfig, maskKey, DEFAULT_CONFIG } from "../config.js";

let base: string;
afterEach(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

describe("config", () => {
  it("파일이 없으면 기본값", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-cfg-"));
    const c = loadConfig(base);
    expect(c.imageModel).toBe(DEFAULT_CONFIG.imageModel);
    expect(c.imageCount).toBe(1);
    expect(c.extractionMode).toBe("subscription");
  });

  it("저장하면 다시 읽힌다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-cfg-"));
    saveConfig({ imageCount: 3, geminiApiKey: "secret-key-1234" }, base);
    const c = loadConfig(base);
    expect(c.imageCount).toBe(3);
    expect(c.geminiApiKey).toBe("secret-key-1234");
  });

  it("빈 키 값은 기존 키를 지우지 않는다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-cfg-"));
    saveConfig({ geminiApiKey: "keepme-9999" }, base);
    saveConfig({ geminiApiKey: "   " }, base);
    expect(loadConfig(base).geminiApiKey).toBe("keepme-9999");
  });

  it("maskKey는 끝 4자리만 남긴다", () => {
    expect(maskKey("abcdefgh1234")).toBe("****1234");
    expect(maskKey("")).toBe("");
    expect(maskKey("ab")).toBe("****");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: FAIL (`../config.js` 없음)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/config.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export interface PromptcatConfig {
  geminiApiKey: string;
  imageModel: string;
  aspectRatio: string;
  imageCount: number;
  extractionMode: "subscription" | "api";
}

export const DEFAULT_CONFIG: PromptcatConfig = {
  geminiApiKey: "",
  imageModel: "gemini-2.5-flash-image",
  aspectRatio: "1:1",
  imageCount: 1,
  extractionMode: "subscription",
};

const CONFIG_FILE = "promptcat-config.json";

// 파일+기본값만 (환경변수 폴백 없음). 저장 기준값으로도 쓴다.
function readFileConfig(baseDir: string): PromptcatConfig {
  const file = path.join(baseDir, CONFIG_FILE);
  let fromFile: Partial<PromptcatConfig> = {};
  if (existsSync(file)) {
    try {
      fromFile = JSON.parse(readFileSync(file, "utf8")) as Partial<PromptcatConfig>;
    } catch {
      fromFile = {};
    }
  }
  return { ...DEFAULT_CONFIG, ...fromFile };
}

export function loadConfig(baseDir = "."): PromptcatConfig {
  const merged = readFileConfig(baseDir);
  if (!merged.geminiApiKey) merged.geminiApiKey = process.env.GEMINI_API_KEY ?? "";
  return merged;
}

export function saveConfig(patch: Partial<PromptcatConfig>, baseDir = "."): PromptcatConfig {
  const clean: Partial<PromptcatConfig> = { ...patch };
  // 빈/공백 키는 무시해 실수로 키를 지우지 않게 한다.
  if (clean.geminiApiKey !== undefined && clean.geminiApiKey.trim() === "") {
    delete clean.geminiApiKey;
  }
  const next = { ...readFileConfig(baseDir), ...clean };
  writeFileSync(path.join(baseDir, CONFIG_FILE), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 4) return "****";
  return "****" + key.slice(-4);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/__tests__/config.test.ts
git commit -m "feat: promptcat-config.json 설정 저장소 추가"
```

---

### Task 2: 프롬프트 조립 (`prompt-assembly.ts`)

**Files:**
- Create: `src/prompt-assembly.ts`
- Test: `src/__tests__/prompt-assembly.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/prompt-assembly.test.ts
import { describe, it, expect } from "vitest";
import { assemblePrompt } from "../prompt-assembly.js";
import type { ExtractionResult } from "../schema.js";

const result: ExtractionResult = {
  imageType: "일러스트",
  fullPrompt: "{{캐릭터}}이(가) {{소품}}과 함께 있다",
  fixedElements: [],
  variableElements: [
    { id: "char", category: "주인공", value: "고양이", placeholder: "{{캐릭터}}" },
    { id: "prop", category: "사물", value: "하트", placeholder: "{{소품}}" },
  ],
  negativePrompt: "",
  notes: "",
};

describe("assemblePrompt", () => {
  it("override 값으로 빈칸을 채운다", () => {
    const out = assemblePrompt(result, { char: "강아지" });
    expect(out).toBe("강아지이(가) 하트과 함께 있다");
  });

  it("override가 없으면 저장된 값으로 채운다", () => {
    expect(assemblePrompt(result, {})).toBe("고양이이(가) 하트과 함께 있다");
  });

  it("결과에 빈칸 토큰이 남지 않는다", () => {
    const out = assemblePrompt(result, { char: "여우", prop: "별" });
    expect(out).not.toContain("{{");
    expect(out).toBe("여우이(가) 별과 함께 있다");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/prompt-assembly.test.ts`
Expected: FAIL (`../prompt-assembly.js` 없음)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/prompt-assembly.ts
import type { ExtractionResult } from "./schema.js";

// fullPrompt의 {{placeholder}} 토큰을 (수정된) 값으로 치환한다.
// overrides: 변동요소 id -> 새 값. 비어 있으면 그 요소의 저장된 value로 채운다.
export function assemblePrompt(
  result: ExtractionResult,
  overrides: Record<string, string> = {},
): string {
  let out = result.fullPrompt;
  for (const el of result.variableElements) {
    const raw = overrides[el.id];
    const value = raw !== undefined && raw.trim() !== "" ? raw : el.value;
    out = out.split(el.placeholder).join(value);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/prompt-assembly.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/prompt-assembly.ts src/__tests__/prompt-assembly.test.ts
git commit -m "feat: 빈칸을 채워 프롬프트를 조립하는 assemblePrompt 추가"
```

---

### Task 3: Gemini 이미지 생성기 (`image-provider.ts`)

**Files:**
- Create: `src/image-provider.ts`
- Test: `src/__tests__/image-provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/image-provider.test.ts
import { describe, it, expect } from "vitest";
import {
  buildGeminiRequest,
  parseGeminiImage,
  GeminiImageProvider,
} from "../image-provider.js";
import { DEFAULT_CONFIG } from "../config.js";

const config = { ...DEFAULT_CONFIG, geminiApiKey: "k-1234", aspectRatio: "16:9" };

describe("buildGeminiRequest", () => {
  it("모델·프롬프트·비율을 담는다", () => {
    const { url, body } = buildGeminiRequest("고양이 그림", config);
    expect(url).toContain(config.imageModel);
    expect(body).toContain("고양이 그림");
    expect(body).toContain("16:9");
  });
});

describe("parseGeminiImage", () => {
  it("inlineData의 base64를 Buffer로 꺼낸다", () => {
    const json = {
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AQID" } }] } }],
    };
    const img = parseGeminiImage(json);
    expect(img.mediaType).toBe("image/png");
    expect([...img.data]).toEqual([1, 2, 3]); // AQID = 0x01 0x02 0x03
  });

  it("이미지가 없으면 에러", () => {
    expect(() => parseGeminiImage({ candidates: [] })).toThrow();
  });
});

describe("GeminiImageProvider", () => {
  it("가짜 fetch로 그림을 만든다", async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AQID" } }] } }] }),
        { status: 200 },
      );
    const provider = new GeminiImageProvider(config, fakeFetch as unknown as typeof fetch);
    const img = await provider.generate("프롬프트");
    expect([...img.data]).toEqual([1, 2, 3]);
  });

  it("키가 없으면 에러", async () => {
    const provider = new GeminiImageProvider({ ...config, geminiApiKey: "" });
    await expect(provider.generate("x")).rejects.toThrow();
  });

  it("응답이 실패면 상태코드를 담아 에러", async () => {
    const fakeFetch = async () => new Response("nope", { status: 429 });
    const provider = new GeminiImageProvider(config, fakeFetch as unknown as typeof fetch);
    await expect(provider.generate("x")).rejects.toThrow("429");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/image-provider.test.ts`
Expected: FAIL (`../image-provider.js` 없음)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/image-provider.ts
import type { PromptcatConfig } from "./config.js";

export interface GeneratedImage {
  data: Buffer;
  mediaType: string;
}

export interface ImageProvider {
  generate(prompt: string): Promise<GeneratedImage>;
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function buildGeminiRequest(
  prompt: string,
  config: PromptcatConfig,
): { url: string; body: string } {
  const url = `${ENDPOINT}/${config.imageModel}:generateContent`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: config.aspectRatio },
    },
  });
  return { url, body };
}

interface GeminiInline {
  data?: string;
  mimeType?: string;
  mime_type?: string;
}
interface GeminiPart {
  inlineData?: GeminiInline;
  inline_data?: GeminiInline;
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

export function parseGeminiImage(json: unknown): GeneratedImage {
  const parts = (json as GeminiResponse).candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = p.inlineData ?? p.inline_data;
    const data = inline?.data;
    if (data) {
      return {
        data: Buffer.from(data, "base64"),
        mediaType: inline?.mimeType ?? inline?.mime_type ?? "image/png",
      };
    }
  }
  throw new Error("Gemini 응답에 이미지가 없어요.");
}

export class GeminiImageProvider implements ImageProvider {
  readonly #config: PromptcatConfig;
  readonly #fetch: typeof fetch;

  constructor(config: PromptcatConfig, fetchFn: typeof fetch = fetch) {
    this.#config = config;
    this.#fetch = fetchFn;
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    if (!this.#config.geminiApiKey) {
      throw new Error("Gemini 키가 없어요. ⚙️ 설정에서 키를 넣어 주세요.");
    }
    const { url, body } = buildGeminiRequest(prompt, this.#config);
    const res = await this.#fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.#config.geminiApiKey,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini 오류 ${res.status}: ${text.slice(0, 200)}`);
    }
    return parseGeminiImage(await res.json());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/image-provider.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/image-provider.ts src/__tests__/image-provider.test.ts
git commit -m "feat: Gemini 이미지 생성기(GeminiImageProvider) 추가"
```

---

### Task 4: 생성 묶기 (`generate.ts`)

**Files:**
- Create: `src/generate.ts`
- Test: `src/__tests__/generate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/generate.test.ts
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

    expect(provider.lastPrompt).toBe("강아지 그림");
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
    });
    expect(res.files.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/generate.test.ts`
Expected: FAIL (`../generate.js` 없음)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/generate.ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractionResultSchema } from "./schema.js";
import { assemblePrompt } from "./prompt-assembly.js";
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

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
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
  const s = stamp(opts.now ?? new Date());
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/generate.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/generate.ts src/__tests__/generate.test.ts
git commit -m "feat: 조립→생성→저장을 묶는 generateForModule 추가"
```

---

### Task 5: 컬렉션에 생성물 목록 추가 (`collection.ts`)

**Files:**
- Modify: `src/collection.ts`
- Modify: `src/__tests__/collection.test.ts`
- Modify: `src/__tests__/gallery.test.ts` (타입 보정)

- [ ] **Step 1: collection.test.ts에 gen 시나리오 추가**

`src/__tests__/collection.test.ts`의 두 번째 `it(...)` 블록 끝(마지막 `expect` 다음 줄, `});` 앞)에 추가:

```ts
    expect(list[0].generatedImages).toEqual([]);
```

그리고 같은 파일의 `describe("listModules", () => {` 안, 두 번째 `it` 블록 **뒤에** 새 `it` 추가:

```ts
  it("gen-* 이미지는 generatedImages로, 썸네일은 원본으로 잡는다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-col-"));
    const d = path.join(base, "제품-20260616-040114");
    await mkdir(d, { recursive: true });
    await writeFile(path.join(d, "prompt.json"), JSON.stringify(good), "utf8");
    await writeFile(path.join(d, "image.png"), Buffer.from([0x89, 0x50]));
    await writeFile(path.join(d, "gen-20260616-050000.png"), Buffer.from([0x89, 0x50]));
    const list = await listModules(base);
    expect(list[0].imageFile).toBe("image.png");
    expect(list[0].generatedImages).toEqual(["gen-20260616-050000.png"]);
  });
```

- [ ] **Step 2: gallery.test.ts의 entry 리터럴에 generatedImages 추가**

`src/__tests__/gallery.test.ts`의 `const entry: ModuleEntry = {` 객체에서 `imageFile: "image.png",` 줄 바로 아래에 추가:

```ts
  generatedImages: [],
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/collection.test.ts`
Expected: FAIL (`generatedImages` 속성이 `ModuleEntry`에 없음 / 값 불일치)

- [ ] **Step 4: collection.ts 구현 수정**

`src/collection.ts`에서 `ModuleEntry` 인터페이스에 필드 추가:

```ts
export interface ModuleEntry {
  dir: string; // modules/ 기준 폴더 이름
  imageFile: string; // 예: "image.png"
  generatedImages: string[]; // gen-* 로 만든 그림 파일명들
  result: ExtractionResult;
}
```

그리고 `for` 루프 안의 이미지 선택 부분(아래 블록)을:

```ts
      const files = await readdir(dir);
      const imageFile = files.find((f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase()));
      if (!imageFile) continue;

      entries.push({ dir: ent.name, imageFile, result: parsed.data });
```

다음으로 교체:

```ts
      const files = await readdir(dir);
      const images = files.filter((f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase()));
      const imageFile = images.find((f) => !f.startsWith("gen-")) ?? images[0];
      if (!imageFile) continue;
      const generatedImages = images.filter((f) => f.startsWith("gen-")).sort();

      entries.push({ dir: ent.name, imageFile, generatedImages, result: parsed.data });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/collection.test.ts src/__tests__/gallery.test.ts`
Expected: PASS (collection 3, gallery 5)

- [ ] **Step 6: Commit**

```bash
git add src/collection.ts src/__tests__/collection.test.ts src/__tests__/gallery.test.ts
git commit -m "feat: ModuleEntry에 generatedImages(생성물 목록) 추가"
```

---

### Task 6: 서버에 생성 창구 추가 (`gallery-server.ts` — `POST /generate`)

**Files:**
- Modify: `src/gallery-server.ts`
- Modify: `src/__tests__/gallery-server.test.ts`

- [ ] **Step 1: gallery-server.test.ts에 생성 테스트 추가**

`src/__tests__/gallery-server.test.ts` 맨 위 import 아래에 가짜 provider import용 타입 추가:

```ts
import type { ImageProvider } from "../image-provider.js";
```

그리고 `describe("createGalleryServer", () => {` 안, 기존 `it(...)` 블록 **뒤에** 추가:

```ts
  it("POST /generate 는 그림을 만들어 저장한다", async () => {
    await setup();
    const fake: ImageProvider = {
      async generate() {
        return { data: Buffer.from([1, 2, 3]), mediaType: "image/png" };
      },
    };
    const server = createGalleryServer(base, { provider: fake });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dir: "product-20260101-000000", overrides: {} }),
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { files: string[] };
      expect(json.files.length).toBe(1);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("POST /generate 실패 시 에러 메시지를 JSON으로 준다", async () => {
    await setup();
    const fake: ImageProvider = {
      async generate() {
        throw new Error("키없음");
      },
    };
    const server = createGalleryServer(base, { provider: fake });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dir: "product-20260101-000000", overrides: {} }),
      });
      expect(res.status).toBe(500);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain("키없음");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/gallery-server.test.ts`
Expected: FAIL (`createGalleryServer`가 2번째 인자/`/generate` 미지원)

- [ ] **Step 3: gallery-server.ts 전체 교체**

```ts
// src/gallery-server.ts
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listModules } from "./collection.js";
import { renderGallery } from "./gallery.js";
import { loadConfig } from "./config.js";
import { generateForModule } from "./generate.js";
import { GeminiImageProvider, type ImageProvider } from "./image-provider.js";

const PORT = 4517;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export interface GalleryServerOptions {
  provider?: ImageProvider; // 테스트에서 가짜 provider 주입
  configDir?: string; // promptcat-config.json 위치 (기본 ".")
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function createGalleryServer(baseDir: string, opts: GalleryServerOptions = {}): http.Server {
  const root = path.resolve(baseDir);
  const configDir = opts.configDir ?? ".";

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname === "/") {
        const html = renderGallery(await listModules(baseDir));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.method === "POST" && url.pathname === "/generate") {
        try {
          const { dir, overrides } = JSON.parse(await readBody(req)) as {
            dir: string;
            overrides?: Record<string, string>;
          };
          const moduleRoot = path.resolve(root, dir);
          if (moduleRoot !== root && !moduleRoot.startsWith(root + path.sep)) {
            res.writeHead(403, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "forbidden" }));
            return;
          }
          const config = loadConfig(configDir);
          const provider = opts.provider ?? new GeminiImageProvider(config);
          const result = await generateForModule({
            baseDir,
            dir,
            overrides: overrides ?? {},
            provider,
            count: config.imageCount,
          });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
        return;
      }

      if (url.pathname.startsWith("/img/")) {
        const rel = decodeURIComponent(url.pathname.slice("/img/".length));
        const full = path.resolve(root, rel);
        if (full !== root && !full.startsWith(root + path.sep)) {
          res.writeHead(403);
          res.end("forbidden");
          return;
        }
        const data = await readFile(full);
        res.writeHead(200, {
          "content-type": MIME[path.extname(full).toLowerCase()] ?? "application/octet-stream",
        });
        res.end(data);
        return;
      }

      res.writeHead(404);
      res.end("not found");
    } catch {
      res.writeHead(500);
      res.end("error");
    }
  });
}

// tsx로 직접 실행하면 서버를 켠다.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createGalleryServer("modules").listen(PORT, () => {
    console.log(`http://localhost:${PORT}`);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/gallery-server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/gallery-server.ts src/__tests__/gallery-server.test.ts
git commit -m "feat: 서버에 POST /generate 추가(provider 주입 가능)"
```

---

### Task 7: 설정 페이지 HTML (`gallery-settings.ts`)

**Files:**
- Create: `src/gallery-settings.ts`
- Test: `src/__tests__/gallery-settings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/gallery-settings.test.ts
import { describe, it, expect } from "vitest";
import { renderSettings } from "../gallery-settings.js";
import { DEFAULT_CONFIG } from "../config.js";

describe("renderSettings", () => {
  it("항목과 현재 값을 담는다", () => {
    const html = renderSettings({ ...DEFAULT_CONFIG, imageModel: "gemini-2.5-flash-image", imageCount: 2 });
    expect(html).toContain("설정");
    expect(html).toContain("gemini-2.5-flash-image");
    expect(html).toContain("16:9"); // 비율 선택지
    expect(html).toContain('value="2"'); // imageCount
  });

  it("키는 마스킹해서 보여준다", () => {
    const html = renderSettings({ ...DEFAULT_CONFIG, geminiApiKey: "supersecret-7777" });
    expect(html).toContain("****7777");
    expect(html).not.toContain("supersecret-7777");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/gallery-settings.test.ts`
Expected: FAIL (`../gallery-settings.js` 없음)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/gallery-settings.ts
import { maskKey, type PromptcatConfig } from "./config.js";
import { escapeHtml } from "./gallery.js";

const ASPECTS = ["1:1", "3:4", "4:3", "16:9", "9:16"];

function aspectOptions(current: string): string {
  return ASPECTS.map(
    (a) => `<option value="${a}"${a === current ? " selected" : ""}>${a}</option>`,
  ).join("");
}

export function renderSettings(config: PromptcatConfig): string {
  const masked = maskKey(config.geminiApiKey);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>프롬냥이 설정</title>
<style>
  body { font-family: system-ui, sans-serif; margin:0; background:#faf7f5; color:#333; }
  .wrap { max-width:560px; margin:0 auto; padding:24px; }
  h1 { font-size:20px; }
  label { display:block; margin:16px 0 6px; font-weight:600; }
  input, select { width:100%; padding:10px; font-size:15px; border:1px solid #ddd; border-radius:8px; box-sizing:border-box; }
  .hint { color:#999; font-size:12px; margin-top:4px; }
  button { margin-top:20px; padding:12px 20px; font-size:15px; border:none; border-radius:8px; background:#ff8fab; color:#fff; cursor:pointer; }
  #msg { margin-top:12px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>⚙️ 프롬냥이 설정</h1>

  <label>Gemini API 키</label>
  <input id="geminiApiKey" type="password" placeholder="${masked ? "현재: " + escapeHtml(masked) + " (바꿀 때만 입력)" : "키를 붙여넣어 주세요"}">
  <div class="hint">Google AI Studio에서 무료로 받을 수 있어요. 비워두면 기존 키가 유지됩니다.</div>

  <label>이미지 모델</label>
  <input id="imageModel" type="text" value="${escapeHtml(config.imageModel)}">

  <label>이미지 비율</label>
  <select id="aspectRatio">${aspectOptions(config.aspectRatio)}</select>

  <label>한 번에 만들 장수 (1~4)</label>
  <input id="imageCount" type="number" min="1" max="4" value="${config.imageCount}">

  <label>추출 방식</label>
  <select id="extractionMode">
    <option value="subscription"${config.extractionMode === "subscription" ? " selected" : ""}>Claude 구독</option>
    <option value="api"${config.extractionMode === "api" ? " selected" : ""}>API 키</option>
  </select>

  <button id="save">저장</button>
  <div id="msg"></div>
</div>

<script>
document.getElementById("save").addEventListener("click", async function () {
  const patch = {
    geminiApiKey: document.getElementById("geminiApiKey").value,
    imageModel: document.getElementById("imageModel").value,
    aspectRatio: document.getElementById("aspectRatio").value,
    imageCount: Number(document.getElementById("imageCount").value),
    extractionMode: document.getElementById("extractionMode").value,
  };
  const msg = document.getElementById("msg");
  try {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    msg.textContent = res.ok ? "저장됐어요! 🐱" : "저장 실패 😿";
    document.getElementById("geminiApiKey").value = "";
  } catch (e) {
    msg.textContent = "저장 실패: " + e;
  }
});
</script>
</body>
</html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/gallery-settings.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/gallery-settings.ts src/__tests__/gallery-settings.test.ts
git commit -m "feat: 설정 페이지 HTML(renderSettings) 추가"
```

---

### Task 8: 서버에 설정 라우트 추가 (`gallery-server.ts`)

**Files:**
- Modify: `src/gallery-server.ts`
- Modify: `src/__tests__/gallery-server.test.ts`

- [ ] **Step 1: gallery-server.test.ts에 설정 라우트 테스트 추가**

`describe("createGalleryServer", () => {` 안 마지막 `it(...)` 뒤에 추가:

```ts
  it("설정 라우트: 저장→조회가 되고 빈 키는 유지된다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-cfgsrv-"));
    const server = createGalleryServer(base, { configDir: base });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const page = await fetch(`http://localhost:${port}/settings`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("설정");

      await fetch(`http://localhost:${port}/api/config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageCount: 3, geminiApiKey: "save-me-4242" }),
      });
      await fetch(`http://localhost:${port}/api/config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ geminiApiKey: "" }),
      });
      const got = await fetch(`http://localhost:${port}/api/config`);
      const cfg = (await got.json()) as { imageCount: number; geminiApiKey: string };
      expect(cfg.imageCount).toBe(3);
      expect(cfg.geminiApiKey).toBe("****4242"); // 마스킹 + 유지
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/gallery-server.test.ts`
Expected: FAIL (`/settings`·`/api/config` 미지원)

- [ ] **Step 3: gallery-server.ts에 라우트 추가**

`src/gallery-server.ts` 상단 import에 추가:

```ts
import { loadConfig, saveConfig, maskKey, type PromptcatConfig } from "./config.js";
import { renderSettings } from "./gallery-settings.js";
```

(주의: 기존 `import { loadConfig } from "./config.js";` 줄을 위 줄로 교체한다.)

그리고 `POST /generate` 블록 **뒤에**(`if (url.pathname.startsWith("/img/"))` 앞) 추가:

```ts
      if (url.pathname === "/settings") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderSettings(loadConfig(configDir)));
        return;
      }

      if (url.pathname === "/api/config") {
        if (req.method === "POST") {
          const patch = JSON.parse(await readBody(req)) as Partial<PromptcatConfig>;
          saveConfig(patch, configDir);
        }
        const cfg = loadConfig(configDir);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...cfg, geminiApiKey: maskKey(cfg.geminiApiKey) }));
        return;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/gallery-server.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/gallery-server.ts src/__tests__/gallery-server.test.ts
git commit -m "feat: 서버에 설정 페이지/api 라우트 추가"
```

---

### Task 9: 갤러리 상세창에 생성 UI (`gallery.ts`)

**Files:**
- Modify: `src/gallery.ts`
- Modify: `src/__tests__/gallery.test.ts`

- [ ] **Step 1: gallery.test.ts에 생성 UI 검증 추가**

`src/__tests__/gallery.test.ts`의 `describe("renderGallery", ...)` 안, 첫 `it("유형·프롬프트·요소·이미지경로를 담는다", ...)` 블록 **뒤에** 추가:

```ts
  it("상세창용 생성 UI(입력칸·버튼)와 생성물 데이터를 담는다", () => {
    const withGen: ModuleEntry = { ...entry, generatedImages: ["gen-20260616-050000.png"] };
    const html = renderGallery([withGen]);
    expect(html).toContain("이미지 생성"); // 🎨 버튼 문구 (클라이언트 JS 안에 포함)
    expect(html).toContain("data-var"); // 변동요소 입력칸을 만드는 setAttribute 코드
    expect(html).toContain("/generate"); // 생성 요청 경로
    expect(html).toContain("gen-20260616-050000.png"); // 생성물 파일명(임베드 데이터에 포함)
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/gallery.test.ts`
Expected: FAIL (문구/속성 없음)

- [ ] **Step 3: gallery.ts의 openDetail 및 헬퍼 수정**

`src/gallery.ts`의 `<script>` 안 `openDetail` 함수를 통째로 아래로 교체한다(기존 `function openDetail(i) { ... }` 블록 전체):

```js
function imgStrip(dir, files) {
  if (!files.length) return null;
  const strip = document.createElement("div");
  strip.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px";
  files.forEach(function (f) {
    const im = document.createElement("img");
    im.src = "/img/" + encodeURIComponent(dir) + "/" + encodeURIComponent(f);
    im.style.cssText = "width:96px;height:96px;object-fit:contain;background:#f0ecea;border-radius:6px";
    strip.appendChild(im);
  });
  return strip;
}

function openDetail(i) {
  const m = MODULES[i];
  const sheet = document.getElementById("sheet");
  sheet.innerHTML = "";
  const close = document.createElement("button");
  close.className = "close"; close.textContent = "×"; close.addEventListener("click", closeDetail);
  sheet.appendChild(close);
  const h2 = document.createElement("h2"); h2.textContent = m.result.imageType; sheet.appendChild(h2);
  addRow(sheet, "전체", m.result.fullPrompt);
  m.result.fixedElements.forEach(function (e) { addRow(sheet, "고정·" + e.category, e.value); });

  // 변동요소: 복사 + 수정용 입력칸
  const inputs = {};
  m.result.variableElements.forEach(function (e) {
    addRow(sheet, "변동·" + e.category, e.value + "  " + e.placeholder);
    const wrap = document.createElement("div"); wrap.className = "row";
    const k = document.createElement("div"); k.className = "k"; k.textContent = "↳ " + e.category;
    const inp = document.createElement("input");
    inp.setAttribute("data-var", e.id);
    inp.value = e.value;
    inp.style.cssText = "flex:1;padding:6px;border:1px solid #ddd;border-radius:6px";
    inputs[e.id] = inp;
    wrap.append(k, inp); sheet.appendChild(wrap);
  });

  // 🎨 생성 버튼 + 결과 영역
  const genBtn = document.createElement("button");
  genBtn.className = "copy"; genBtn.textContent = "🎨 이미지 생성";
  genBtn.style.cssText = "margin-top:16px;background:#ff8fab;color:#fff;border:none;padding:10px 16px";
  const result = document.createElement("div"); result.style.marginTop = "10px";
  const existing = imgStrip(m.dir, m.generatedImages || []);
  if (existing) result.appendChild(existing);

  genBtn.addEventListener("click", async function () {
    const overrides = {};
    Object.keys(inputs).forEach(function (id) { overrides[id] = inputs[id].value; });
    genBtn.disabled = true; genBtn.textContent = "그리는 중... 🐱";
    try {
      const res = await fetch("/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dir: m.dir, overrides: overrides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "실패");
      const strip = imgStrip(m.dir, data.files);
      if (strip) result.appendChild(strip);
    } catch (e) {
      const err = document.createElement("div"); err.style.color = "#c00";
      err.textContent = "😿 " + e.message; result.appendChild(err);
    } finally {
      genBtn.disabled = false; genBtn.textContent = "🎨 이미지 생성";
    }
  });

  sheet.appendChild(genBtn);
  sheet.appendChild(result);
  document.getElementById("modal").classList.add("open");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/gallery.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/gallery.ts src/__tests__/gallery.test.ts
git commit -m "feat: 갤러리 상세창에 변동요소 입력칸 + 🎨 생성 UI 추가"
```

---

### Task 10: gitignore + 고양이 설정 메뉴 (`.gitignore`, `cat.pyw`)

**Files:**
- Create/Modify: `.gitignore`
- Modify: `/mnt/c/Users/rkdtk/promptcat-launcher/cat.pyw` (깃 밖)

- [ ] **Step 1: .gitignore에 설정/모듈 추가**

`.gitignore`가 없으면 만들고, 없는 줄만 추가:

```
promptcat-config.json
```

(`node_modules`, `modules/`, `.env`가 이미 무시되는지 확인하고, 빠진 것만 추가한다. 이미 있으면 건드리지 않는다.)

- [ ] **Step 2: cat.pyw에 open_settings 추가**

`open_gallery` 함수 정의 **바로 아래**에 추가:

```python
def open_settings():
    def work():
        proc = subprocess.run(
            ["wsl", "-d", "Ubuntu", "bash", "-lc", "~/promptcat/scripts/open-gallery.sh"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=NO_WINDOW,
        )
        lines = [ln for ln in proc.stdout.strip().splitlines() if ln.strip()]
        url = lines[-1] if lines else ""
        if url.startswith("http"):
            root.after(0, lambda: webbrowser.open(url + "/settings"))
        else:
            root.after(0, lambda: messagebox.showwarning(
                "프롬냥이", "설정을 못 열었어 😿\n\n" + tail(proc.stdout + "\n" + proc.stderr)))

    threading.Thread(target=work, daemon=True).start()
```

- [ ] **Step 3: 우클릭 메뉴에 설정 항목 추가**

`menu.add_command(label="📂 컬렉션 열기", command=open_gallery)` 줄 **아래**에 추가:

```python
menu.add_command(label="⚙️ 설정", command=open_settings)
```

- [ ] **Step 4: 문법 검사**

Run:
```bash
powershell.exe -NoProfile -Command "py -3 -m py_compile 'C:\Users\rkdtk\promptcat-launcher\cat.pyw'; if (\$LASTEXITCODE -eq 0) { 'SYNTAX_OK' } else { 'SYNTAX_FAIL' }"
```
Expected: `SYNTAX_OK`

- [ ] **Step 5: 고양이 재시작**

Run:
```bash
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='pythonw.exe'\" | Where-Object { \$_.CommandLine -like '*cat.pyw*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId }; Start-Process -FilePath 'C:\Users\rkdtk\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe' -ArgumentList '\"C:\Users\rkdtk\promptcat-launcher\cat.pyw\"' -WorkingDirectory 'C:\Users\rkdtk\promptcat-launcher'"
```
Expected: 새 고양이가 떠 있고, 우클릭에 "⚙️ 설정"이 보인다.

- [ ] **Step 6: Commit (gitignore만)**

```bash
git add .gitignore
git commit -m "chore: promptcat-config.json을 gitignore에 추가"
```
(cat.pyw는 깃 저장소 밖이라 커밋 대상 아님)

---

### Task 11: 전체 검증 + 가지 마무리

**Files:** (없음 — 검증/병합만)

- [ ] **Step 1: 타입검사 + 전체 테스트**

Run:
```bash
npx tsc --noEmit && npx vitest run
```
Expected: 타입 OK, 모든 테스트 PASS(기존 26 + 신규: config 4, prompt-assembly 3, image-provider 6, generate 2, collection +1, gallery +1, gallery-settings 2, gallery-server +3 = 약 48개).

- [ ] **Step 2: 수동 end-to-end 확인**

1. 고양이 우클릭 → "⚙️ 설정" → 브라우저 설정 페이지 열림.
2. Gemini 키 입력 후 저장 → "저장됐어요!" → 새로고침하면 키가 `****`로 보임.
3. 고양이에 사진 한 장 먹이기 → 모듈 생김.
4. 고양이 더블클릭 → 갤러리 → 카드 클릭 → 변동요소 값 하나 바꾸고 🎨 생성 → 그림이 상세창에 나타남.
5. 갤러리 다시 열어 같은 카드 → 예전 생성물이 보임.

- [ ] **Step 3: master에 병합**

```bash
git checkout master
git merge feat/image-generation
npx vitest run
git branch -d feat/image-generation
```
Expected: 병합, 테스트 PASS, 가지 삭제.

---

## 메모 / 위험요소

- Gemini 이미지 API의 정확한 필드(`responseModalities`, `imageConfig.aspectRatio`)는 모델 버전에 따라 다를 수 있다. 실제 키로 처음 호출할 때 400이 나면 응답 본문의 안내를 보고 `buildGeminiRequest`의 body를 맞춘다(테스트는 요청 구성만 검증하므로 영향 없음).
- 키는 `promptcat-config.json`에 평문 저장되며 `.gitignore`로 깃 제외한다. 로컬 개인용 가정.
- `npm run gallery`는 `.env`를 자동으로 읽지 않는다. 키는 설정 페이지로 넣는 것이 기본 경로다(환경변수 `GEMINI_API_KEY`가 있으면 폴백으로 쓰인다).
- `cat.pyw`는 깃 저장소 밖이라 버전관리 대상이 아니다. 변경은 직접 적용한다.
