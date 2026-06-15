# PromptCat B단계 — 프롬프트 추출 엔진 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사진 1장을 넣으면 유형 판별 + 전체 프롬프트 + 고정/변동 요소를 뽑아 JSON+Markdown 모듈로 저장하는 헤드리스 엔진을 만든다.

**Architecture:** 작은 단위(스키마/지시문/AI어댑터/마크다운/저장기/엔진/CLI)로 쪼갠 TypeScript/Node 프로젝트. AI는 어댑터 인터페이스 뒤에 두어 BYOK + 교체 가능하게 한다. 엔진은 어댑터가 돌려준 결과를 zod로 검증한다.

**Tech Stack:** TypeScript, Node(ESM, NodeNext), vitest(테스트), zod(스키마), @anthropic-ai/sdk(Claude `claude-opus-4-8`), tsx(CLI 실행).

관련 spec: `docs/superpowers/specs/2026-06-15-promptcat-extraction-engine-design.md`

---

## 파일 구조 (이번 단계에서 만드는 것)

```
promptcat/
├── package.json              # scripts, type:module, deps
├── tsconfig.json             # NodeNext, strict
├── vitest.config.ts          # 테스트 설정
├── .gitignore                # node_modules, dist, modules
└── src/
    ├── schema.ts             # ExtractionResult zod 스키마 + 타입
    ├── extraction-prompt.ts  # JSON 출력용 지시문 생성
    ├── markdown.ts           # ExtractionResult → 사람용 Markdown
    ├── storage.ts            # 모듈 1개를 폴더로 저장
    ├── engine.ts             # 사진 로드→지시문→어댑터→검증→결과
    ├── cli.ts                # `npm run extract -- <사진>` 진입점
    └── providers/
        ├── types.ts          # VisionProvider 인터페이스
        └── claude.ts         # ClaudeProvider (실제 API, 단위테스트 없음)
└── src/__tests__/
    ├── schema.test.ts
    ├── extraction-prompt.test.ts
    ├── markdown.test.ts
    ├── storage.test.ts
    └── engine.test.ts
```

각 파일은 책임이 하나씩이다. `claude.ts`와 `cli.ts`는 네트워크/프로세스에 의존하므로 단위테스트 대신 수동 통합테스트(Task 7)로 검증한다.

---

## Task 1: 프로젝트 뼈대 만들기

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: `package.json` 작성**

```json
{
  "name": "promptcat",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "test": "vitest run",
    "extract": "tsx src/cli.ts"
  }
}
```

- [ ] **Step 2: `tsconfig.json` 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: `vitest.config.ts` 작성**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: `.gitignore` 작성**

```
node_modules/
dist/
modules/
```

- [ ] **Step 5: 의존성 설치**

Run:
```bash
cd /home/rkdtk/promptcat
npm install zod @anthropic-ai/sdk
npm install -D typescript vitest tsx @types/node
```
Expected: `node_modules/` 생성, `package.json`에 dependencies/devDependencies 채워짐.

- [ ] **Step 6: 커밋**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore package-lock.json
git commit -m "chore: promptcat 프로젝트 뼈대 + 의존성 설정"
```

---

## Task 2: 결과 스키마 (schema.ts)

**Files:**
- Create: `src/schema.ts`
- Test: `src/__tests__/schema.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/__tests__/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { extractionResultSchema } from "../schema.js";

const valid = {
  imageType: "제품 사진",
  fullPrompt: "warm product shot on wooden table",
  fixedElements: [{ id: "light", category: "조명", value: "따뜻한 햇살" }],
  variableElements: [
    { id: "subject", category: "주인공", value: "고양이", placeholder: "{{주인공}}" },
  ],
  negativePrompt: "blurry",
  notes: "관찰 기반",
};

describe("extractionResultSchema", () => {
  it("올바른 객체를 통과시킨다", () => {
    const result = extractionResultSchema.parse(valid);
    expect(result.imageType).toBe("제품 사진");
    expect(result.variableElements[0].placeholder).toBe("{{주인공}}");
  });

  it("negativePrompt와 notes가 없으면 빈 문자열로 채운다", () => {
    const { negativePrompt, notes, ...rest } = valid;
    const result = extractionResultSchema.parse(rest);
    expect(result.negativePrompt).toBe("");
    expect(result.notes).toBe("");
  });

  it("imageType이 없으면 실패한다", () => {
    const { imageType, ...rest } = valid;
    expect(() => extractionResultSchema.parse(rest)).toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/__tests__/schema.test.ts`
Expected: FAIL — `../schema.js`를 찾을 수 없음.

- [ ] **Step 3: 최소 구현 작성**

`src/schema.ts`:
```ts
import { z } from "zod";

export const fixedElementSchema = z.object({
  id: z.string(),
  category: z.string(),
  value: z.string(),
});

export const variableElementSchema = z.object({
  id: z.string(),
  category: z.string(),
  value: z.string(),
  placeholder: z.string(),
});

export const extractionResultSchema = z.object({
  imageType: z.string(),
  fullPrompt: z.string(),
  fixedElements: z.array(fixedElementSchema),
  variableElements: z.array(variableElementSchema),
  negativePrompt: z.string().default(""),
  notes: z.string().default(""),
});

export type FixedElement = z.infer<typeof fixedElementSchema>;
export type VariableElement = z.infer<typeof variableElementSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/__tests__/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/schema.ts src/__tests__/schema.test.ts
git commit -m "feat: ExtractionResult 스키마 추가"
```

---

## Task 3: 추출 지시문 (extraction-prompt.ts)

**Files:**
- Create: `src/extraction-prompt.ts`
- Test: `src/__tests__/extraction-prompt.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/__tests__/extraction-prompt.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createExtractionPrompt } from "../extraction-prompt.js";

describe("createExtractionPrompt", () => {
  it("JSON 출력과 고정/변동 분리를 지시한다", () => {
    const prompt = createExtractionPrompt();
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("고정요소");
    expect(prompt).toContain("변동요소");
    expect(prompt).toContain("placeholder");
  });

  it("출력 언어를 지시문에 반영한다", () => {
    const prompt = createExtractionPrompt({ outputLanguage: "English" });
    expect(prompt).toContain("English");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/__tests__/extraction-prompt.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현 작성**

`src/extraction-prompt.ts`:
```ts
export interface ExtractionPromptInput {
  outputLanguage?: string;
}

export function createExtractionPrompt(input: ExtractionPromptInput = {}): string {
  const language = input.outputLanguage ?? "한국어";
  return [
    "첨부한 이미지를 분석해서 재사용 가능한 이미지 생성 프롬프트를 추출해줘.",
    "이미지 유형을 먼저 판별해줘. 실사 사진, 시네마틱 컷, 인물, 제품, 음식, 인테리어, 건축, 풍경, 매크로, 패션, 과거/다큐, 일러스트, 포스터, 인포그래픽, UI/웹사이트/슬라이드, 소셜 카드, 로고, 텍스트 중심 이미지, 합성 이미지 중 무엇에 가까운지 보고 그 유형에 맞는 항목만 깊게 추출해줘.",
    "사진이면 카메라/렌즈 느낌, 초점거리/프레이밍, 조리개/심도, ISO/그레인, 색온도, 노출, 시간대, 광원을 생성용 감각 제어값으로 표현해줘(EXIF 확정값 아님).",
    "고정요소(조명/카메라/구도/색감/매체 등 잘 안 바꾸는 뼈대)와 변동요소(주인공/사물/색상테마 등 갈아끼우는 슬롯)를 스스로 판단해서 나눠줘.",
    "각 변동요소에는 {{이름}} 형태의 placeholder를 붙여줘.",
    "변수성 텍스트·개인정보·데이터 값·고유명사는 프롬프트에 넣지 말고 구조적으로만 설명해줘.",
    `모든 설명 문장은 ${language}로 작성해줘.`,
    "반드시 아래 형태의 JSON만 출력해줘. 코드블럭이나 다른 말은 붙이지 마.",
    '{ "imageType": string, "fullPrompt": string, "fixedElements": [{"id","category","value"}], "variableElements": [{"id","category","value","placeholder"}], "negativePrompt": string, "notes": string }',
  ].join("\n");
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/__tests__/extraction-prompt.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/extraction-prompt.ts src/__tests__/extraction-prompt.test.ts
git commit -m "feat: JSON 출력용 추출 지시문 생성기 추가"
```

---

## Task 4: 사람용 Markdown 변환 (markdown.ts)

**Files:**
- Create: `src/markdown.ts`
- Test: `src/__tests__/markdown.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/__tests__/markdown.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../markdown.js";
import type { ExtractionResult } from "../schema.js";

const result: ExtractionResult = {
  imageType: "제품 사진",
  fullPrompt: "warm product shot",
  fixedElements: [{ id: "light", category: "조명", value: "따뜻한 햇살" }],
  variableElements: [
    { id: "subject", category: "주인공", value: "고양이", placeholder: "{{주인공}}" },
  ],
  negativePrompt: "blurry",
  notes: "관찰 기반",
};

describe("renderMarkdown", () => {
  it("유형/전체프롬프트/고정/변동 항목을 포함한다", () => {
    const md = renderMarkdown(result);
    expect(md).toContain("제품 사진");
    expect(md).toContain("warm product shot");
    expect(md).toContain("조명");
    expect(md).toContain("{{주인공}}");
    expect(md).toContain("blurry");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/__tests__/markdown.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현 작성**

`src/markdown.ts`:
```ts
import type { ExtractionResult } from "./schema.js";

export function renderMarkdown(result: ExtractionResult): string {
  const lines: string[] = [];
  lines.push(`# 이미지 프롬프트 — ${result.imageType}`, "");
  lines.push("## 전체 프롬프트", "", "```", result.fullPrompt, "```", "");
  lines.push("## 고정요소 (테마 뼈대)", "");
  for (const el of result.fixedElements) {
    lines.push(`- **${el.category}** (${el.id}): ${el.value}`);
  }
  lines.push("", "## 변동요소 (갈아끼우는 슬롯)", "");
  for (const el of result.variableElements) {
    lines.push(`- **${el.category}** \`${el.placeholder}\`: ${el.value}`);
  }
  if (result.negativePrompt) {
    lines.push("", "## 제외 프롬프트", "", result.negativePrompt);
  }
  if (result.notes) {
    lines.push("", "## 메모", "", result.notes);
  }
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/__tests__/markdown.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: 커밋**

```bash
git add src/markdown.ts src/__tests__/markdown.test.ts
git commit -m "feat: ExtractionResult를 사람용 Markdown으로 변환"
```

---

## Task 5: 모듈 저장기 (storage.ts)

**Files:**
- Create: `src/storage.ts`
- Test: `src/__tests__/storage.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/__tests__/storage.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveModule } from "../storage.js";
import type { ExtractionResult } from "../schema.js";

const result: ExtractionResult = {
  imageType: "제품 사진",
  fullPrompt: "warm product shot",
  fixedElements: [{ id: "light", category: "조명", value: "따뜻한 햇살" }],
  variableElements: [
    { id: "subject", category: "주인공", value: "고양이", placeholder: "{{주인공}}" },
  ],
  negativePrompt: "",
  notes: "",
};

let workDir: string;
afterEach(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe("saveModule", () => {
  it("사진/json/md 3개 파일을 모듈 폴더에 만든다", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "promptcat-"));
    const imagePath = path.join(workDir, "src.png");
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const dir = await saveModule({
      imagePath,
      result,
      baseDir: path.join(workDir, "modules"),
      slug: "테스트",
      now: new Date("2026-06-15T01:02:03"),
    });

    expect(dir).toContain("테스트-20260615-010203");
    const json = JSON.parse(await readFile(path.join(dir, "prompt.json"), "utf8"));
    expect(json.imageType).toBe("제품 사진");
    const md = await readFile(path.join(dir, "prompt.md"), "utf8");
    expect(md).toContain("제품 사진");
    const img = await readFile(path.join(dir, "image.png"));
    expect(img.length).toBe(4);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/__tests__/storage.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현 작성**

`src/storage.ts`:
```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/__tests__/storage.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: 커밋**

```bash
git add src/storage.ts src/__tests__/storage.test.ts
git commit -m "feat: 모듈을 사진+json+md 폴더로 저장하는 저장기 추가"
```

---

## Task 6: AI 어댑터 인터페이스 + 엔진 (providers/types.ts, engine.ts)

**Files:**
- Create: `src/providers/types.ts`, `src/engine.ts`
- Test: `src/__tests__/engine.test.ts`

- [ ] **Step 1: 어댑터 인터페이스 작성 (테스트 대상 아님, 먼저 만들어 둠)**

`src/providers/types.ts`:
```ts
export interface VisionAnalyzeInput {
  imageBase64: string;
  mediaType: string;
  instruction: string;
}

export interface VisionProvider {
  analyze(input: VisionAnalyzeInput): Promise<unknown>;
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/__tests__/engine.test.ts`:
```ts
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/__tests__/engine.test.ts`
Expected: FAIL — `../engine.js` 없음.

- [ ] **Step 4: 최소 구현 작성**

`src/engine.ts`:
```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { VisionProvider } from "./providers/types.js";
import { createExtractionPrompt } from "./extraction-prompt.js";
import { extractionResultSchema, type ExtractionResult } from "./schema.js";

const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export interface ExtractOptions {
  outputLanguage?: string;
  maxRetries?: number;
}

export async function extractPrompt(
  imagePath: string,
  provider: VisionProvider,
  options: ExtractOptions = {},
): Promise<ExtractionResult> {
  const mediaType = MEDIA_TYPES[path.extname(imagePath).toLowerCase()];
  if (!mediaType) {
    throw new Error(`지원하지 않는 이미지 형식이야: ${imagePath}`);
  }
  const imageBase64 = (await readFile(imagePath)).toString("base64");
  const instruction = createExtractionPrompt({ outputLanguage: options.outputLanguage });
  const maxRetries = options.maxRetries ?? 1;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const raw = await provider.analyze({ imageBase64, mediaType, instruction });
    const parsed = extractionResultSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
    lastError = parsed.error;
  }
  throw new Error(`AI가 올바른 형식으로 답하지 않았어: ${String(lastError)}`);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/__tests__/engine.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: 커밋**

```bash
git add src/providers/types.ts src/engine.ts src/__tests__/engine.test.ts
git commit -m "feat: 어댑터 인터페이스 + 추출 엔진(검증/재시도) 추가"
```

---

## Task 7: Claude 어댑터 + CLI + 수동 통합 테스트

**Files:**
- Create: `src/providers/claude.ts`, `src/cli.ts`

> 이 두 파일은 네트워크/프로세스에 의존해 단위테스트 대신 수동 통합테스트로 검증한다.

- [ ] **Step 1: Claude 어댑터 작성**

`src/providers/claude.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import type { VisionProvider, VisionAnalyzeInput } from "./types.js";

export interface ClaudeProviderOptions {
  apiKey: string;
  model?: string;
}

export class ClaudeProvider implements VisionProvider {
  readonly #client: Anthropic;
  readonly #model: string;

  constructor(options: ClaudeProviderOptions) {
    if (!options.apiKey) {
      throw new Error("ANTHROPIC_API_KEY가 필요해. 설정에서 키를 넣어줘.");
    }
    this.#client = new Anthropic({ apiKey: options.apiKey });
    this.#model = options.model ?? "claude-opus-4-8";
  }

  async analyze(input: VisionAnalyzeInput): Promise<unknown> {
    const message = await this.#client.messages.create({
      model: this.#model,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
                data: input.imageBase64,
              },
            },
            { type: "text", text: input.instruction },
          ],
        },
      ],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return JSON.parse(stripFence(text));
  }
}

function stripFence(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : text).trim();
}
```

- [ ] **Step 2: CLI 작성**

`src/cli.ts`:
```ts
import { ClaudeProvider } from "./providers/claude.js";
import { extractPrompt } from "./engine.js";
import { saveModule } from "./storage.js";

async function main(): Promise<void> {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("사용법: npm run extract -- <이미지경로>");
    process.exit(1);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY 환경변수를 설정해줘.");
    process.exit(1);
  }

  const provider = new ClaudeProvider({ apiKey });
  console.log("🐱 분석 중...");
  const result = await extractPrompt(imagePath, provider);
  const dir = await saveModule({ imagePath, result, baseDir: "modules" });
  console.log(`✨ 완료! 저장 위치: ${dir}`);
  console.log(`유형: ${result.imageType}`);
}

main().catch((err: unknown) => {
  console.error("에러:", err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 3: 타입체크 + 전체 테스트**

Run:
```bash
npm run typecheck
npm test
```
Expected: typecheck 통과(에러 0). vitest 전체 PASS(11 tests).

- [ ] **Step 4: 수동 통합 테스트 (실제 API)**

Run:
```bash
export ANTHROPIC_API_KEY=sk-...   # 본인 키
npm run extract -- assets/character-reference/pusheen-heart.png
```
Expected:
- 콘솔에 `✨ 완료! 저장 위치: modules/...` 출력
- `modules/<slug>-<stamp>/` 폴더에 `image.png`, `prompt.json`, `prompt.md` 생성
- `prompt.json`에 imageType / fullPrompt / fixedElements / variableElements 채워짐
- `prompt.md`를 열어 사람이 읽기 좋은 형태인지 눈으로 확인

- [ ] **Step 5: 커밋**

```bash
git add src/providers/claude.ts src/cli.ts
git commit -m "feat: Claude 어댑터 + extract CLI 추가"
```

---

## 완료 기준 (이 단계 끝)

- `npm test` 전체 통과 (11개 테스트)
- `npm run typecheck` 에러 0
- 실제 사진 1장으로 `npm run extract` 실행 시 모듈 폴더(사진+json+md)가 생성되고, 고정/변동 요소가 채워진다

## 다음 단계 (이 계획 범위 밖)

- C: 고양이=폴더 / 하위폴더 / 모듈 브라우징
- A: 바탕화면 반응형 고양이 UI (캐릭터 메모 참고)
- D/E: 이미지 생성 + 테마 적용 (이미지 생성 모델 슬롯 추가)
