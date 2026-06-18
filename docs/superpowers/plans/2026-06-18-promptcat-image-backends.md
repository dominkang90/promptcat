# 무료 생성(Pollinations) + 백엔드 전환 + 키 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 키 없이 무료(Pollinations)로 그림을 만들고, 상세창에서 Gemini로 전환할 수 있게 하며, 설정에서 Gemini 키 등록 상태 확인·삭제를 제공한다. Gemini의 aspectRatio 400 버그도 고친다.

**Architecture:** 이미지 생성기를 provider 인터페이스로 2개(Pollinations 무료·Gemini 유료) 두고, 서버 `/generate`가 요청의 `backend`(없으면 설정 기본값)로 provider를 고른다. 설정·상세창 UI에 전환·키관리·AI스튜디오 핸드오프를 더한다.

**Tech Stack:** TypeScript(ESM, NodeNext) · Node 내장 `http`/`fs` · vitest · tsx · Pollinations.ai REST · Gemini REST

---

## 시작 전

```bash
cd /home/rkdtk/promptcat
git checkout feat/image-backends   # 이미 이 가지에 스펙 커밋됨
```

## 파일 구조

- Modify: `src/config.ts` — `imageBackend` 추가 + `clearGeminiKey`
- Modify: `src/image-provider.ts` — Gemini aspectRatio 제거 + `aspectToSize`/`buildPollinationsUrl`/`PollinationsImageProvider`
- Modify: `src/gallery-server.ts` — `/generate` backend 선택 + `/api/config/clear-key`
- Modify: `src/gallery-settings.ts` — 기본 생성기 선택 + 키 관리 UI
- Modify: `src/gallery.ts` — 상세창 백엔드 선택칸 + AI 스튜디오 버튼 + backend 전달
- 모든 변경에 대응하는 테스트 수정/추가

---

### Task 1: 설정에 백엔드 + 키삭제 (`config.ts`)

**Files:** Modify `src/config.ts`, `src/__tests__/config.test.ts`

- [ ] **Step 1: 테스트 추가** — `src/__tests__/config.test.ts`

import 줄을 다음으로 교체:
```ts
import { loadConfig, saveConfig, maskKey, clearGeminiKey, DEFAULT_CONFIG } from "../config.js";
```

`describe("config", () => {` 안 마지막 `it` 뒤에 추가:
```ts
  it("기본 이미지 백엔드는 pollinations", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-cfg-"));
    expect(loadConfig(base).imageBackend).toBe("pollinations");
  });

  it("clearGeminiKey는 키를 비운다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-cfg-"));
    saveConfig({ geminiApiKey: "to-be-removed-1111" }, base);
    const after = clearGeminiKey(base);
    expect(after.geminiApiKey).toBe("");
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: FAIL (`clearGeminiKey` 없음, `imageBackend` 없음)

- [ ] **Step 3: 구현** — `src/config.ts`

`PromptcatConfig` 인터페이스에 필드 추가(맨 끝):
```ts
export interface PromptcatConfig {
  geminiApiKey: string;
  imageModel: string;
  aspectRatio: string;
  imageCount: number;
  extractionMode: "subscription" | "api";
  imageBackend: "pollinations" | "gemini";
}
```

`DEFAULT_CONFIG`에 추가:
```ts
export const DEFAULT_CONFIG: PromptcatConfig = {
  geminiApiKey: "",
  imageModel: "gemini-2.5-flash-image",
  aspectRatio: "1:1",
  imageCount: 1,
  extractionMode: "subscription",
  imageBackend: "pollinations",
};
```

파일 끝(맨 아래 `maskKey` 함수 뒤)에 추가:
```ts
// 키를 확실히 지운다(빈 키 무시 규칙을 우회).
export function clearGeminiKey(baseDir = "."): PromptcatConfig {
  const next = { ...readFileConfig(baseDir), geminiApiKey: "" };
  writeFileSync(path.join(baseDir, CONFIG_FILE), JSON.stringify(next, null, 2), "utf8");
  return next;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: PASS (6 tests). 또한 `npx tsc --noEmit` — 이때 `image-provider.ts` 등 다른 곳에서 `PromptcatConfig`를 객체로 만드는 코드가 있으면 타입오류가 날 수 있는데, 테스트는 `DEFAULT_CONFIG` 스프레드를 쓰므로 영향 없음. tsc 오류가 나면 그 위치를 보고하라(다음 태스크에서 처리).

- [ ] **Step 5: Commit**
```bash
git add src/config.ts src/__tests__/config.test.ts
git commit -m "feat: 설정에 imageBackend + clearGeminiKey 추가"
```

---

### Task 2: Pollinations 생성기 + Gemini 버그 수정 (`image-provider.ts`)

**Files:** Modify `src/image-provider.ts`, `src/__tests__/image-provider.test.ts`

- [ ] **Step 1: 테스트 수정/추가** — `src/__tests__/image-provider.test.ts`

import 줄을 다음으로 교체:
```ts
import {
  buildGeminiRequest,
  parseGeminiImage,
  GeminiImageProvider,
  aspectToSize,
  buildPollinationsUrl,
  PollinationsImageProvider,
} from "../image-provider.js";
import { DEFAULT_CONFIG } from "../config.js";
```

기존 `describe("buildGeminiRequest", ...)` 블록 전체를 아래로 교체(aspectRatio 제거 검증):
```ts
describe("buildGeminiRequest", () => {
  it("모델·프롬프트를 담고 aspectRatio는 빼서 400을 피한다", () => {
    const { url, body } = buildGeminiRequest("고양이 그림", config);
    expect(url).toContain(config.imageModel);
    expect(body).toContain("고양이 그림");
    expect(body).toContain("IMAGE");
    expect(body).not.toContain("aspectRatio");
  });
});
```

파일 맨 끝에 추가:
```ts
describe("aspectToSize", () => {
  it("비율을 크기로 바꾼다", () => {
    expect(aspectToSize("16:9")).toEqual({ width: 1280, height: 720 });
    expect(aspectToSize("1:1")).toEqual({ width: 1024, height: 1024 });
    expect(aspectToSize("이상한값")).toEqual({ width: 1024, height: 1024 });
  });
});

describe("buildPollinationsUrl", () => {
  it("프롬프트와 크기를 담는다", () => {
    const url = buildPollinationsUrl("귀여운 고양이", config);
    expect(url).toContain("image.pollinations.ai/prompt/");
    expect(url).toContain(encodeURIComponent("귀여운 고양이"));
    expect(url).toContain("width=1280");
    expect(url).toContain("height=720");
  });
});

describe("PollinationsImageProvider", () => {
  it("가짜 fetch로 그림 바이트를 받는다", async () => {
    const fakeFetch = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    const provider = new PollinationsImageProvider(config, fakeFetch as unknown as typeof fetch);
    const img = await provider.generate("cat");
    expect([...img.data]).toEqual([1, 2, 3]);
    expect(img.mediaType).toBe("image/jpeg");
  });

  it("응답이 실패면 에러", async () => {
    const fakeFetch = async () => new Response("nope", { status: 500 });
    const provider = new PollinationsImageProvider(config, fakeFetch as unknown as typeof fetch);
    await expect(provider.generate("cat")).rejects.toThrow("500");
  });
});
```

NOTE: 파일 상단의 `const config = { ...DEFAULT_CONFIG, geminiApiKey: "k-1234", aspectRatio: "16:9" };` 는 그대로 둔다(aspectRatio 16:9 → Pollinations 크기 1280×720 검증에 쓰임).

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/image-provider.test.ts`
Expected: FAIL (새 export 없음 + 기존 16:9 검증 변경)

- [ ] **Step 3: 구현** — `src/image-provider.ts`

`buildGeminiRequest`의 body를 아래로 교체(`imageConfig` 제거):
```ts
export function buildGeminiRequest(
  prompt: string,
  config: PromptcatConfig,
): { url: string; body: string } {
  const url = `${ENDPOINT}/${config.imageModel}:generateContent`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"] },
  });
  return { url, body };
}
```

파일 맨 끝에 추가:
```ts
const SIZES: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "3:4": { width: 768, height: 1024 },
  "4:3": { width: 1024, height: 768 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
};

export function aspectToSize(aspect: string): { width: number; height: number } {
  return SIZES[aspect] ?? { width: 1024, height: 1024 };
}

export function buildPollinationsUrl(prompt: string, config: PromptcatConfig): string {
  const { width, height } = aspectToSize(config.aspectRatio);
  const enc = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${enc}?width=${width}&height=${height}&nologo=true`;
}

// 키·결제가 필요 없는 무료 생성기(Flux 기반).
export class PollinationsImageProvider implements ImageProvider {
  readonly #config: PromptcatConfig;
  readonly #fetch: typeof fetch;

  constructor(config: PromptcatConfig, fetchFn: typeof fetch = fetch) {
    this.#config = config;
    this.#fetch = fetchFn;
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    const url = buildPollinationsUrl(prompt, this.#config);
    const res = await this.#fetch(url);
    if (!res.ok) {
      throw new Error(`Pollinations 오류 ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf, mediaType: "image/jpeg" };
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/__tests__/image-provider.test.ts`
Expected: PASS. 또한 `npx tsc --noEmit` 무오류.

- [ ] **Step 5: Commit**
```bash
git add src/image-provider.ts src/__tests__/image-provider.test.ts
git commit -m "feat: Pollinations 무료 생성기 추가 + Gemini aspectRatio 400 수정"
```

---

### Task 3: 서버 백엔드 선택 + 키삭제 라우트 (`gallery-server.ts`)

**Files:** Modify `src/gallery-server.ts`, `src/__tests__/gallery-server.test.ts`

- [ ] **Step 1: 테스트 추가** — `src/__tests__/gallery-server.test.ts`

`describe("createGalleryServer", () => {` 안 마지막 `it` 뒤에 추가:
```ts
  it("POST /api/config/clear-key 는 키를 비운다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-clrkey-"));
    const server = createGalleryServer(base, { configDir: base });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      await fetch(`http://localhost:${port}/api/config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ geminiApiKey: "delete-me-5555" }),
      });
      const cleared = await fetch(`http://localhost:${port}/api/config/clear-key`, { method: "POST" });
      const cfg = (await cleared.json()) as { geminiApiKey: string };
      expect(cfg.geminiApiKey).toBe("");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/gallery-server.test.ts`
Expected: FAIL (`/api/config/clear-key` 없음)

- [ ] **Step 3: 구현** — `src/gallery-server.ts`

import 줄 두 개를 교체:
```ts
import { loadConfig, saveConfig, maskKey, clearGeminiKey, type PromptcatConfig } from "./config.js";
import { GeminiImageProvider, PollinationsImageProvider, type ImageProvider } from "./image-provider.js";
```

`POST /generate` 블록 안에서 본문 파싱과 provider 선택을 교체. 기존:
```ts
          const { dir, overrides } = JSON.parse(await readBody(req)) as {
            dir: string;
            overrides?: Record<string, string>;
          };
```
교체:
```ts
          const { dir, overrides, backend } = JSON.parse(await readBody(req)) as {
            dir: string;
            overrides?: Record<string, string>;
            backend?: string;
          };
```
그리고 기존:
```ts
          const config = loadConfig(configDir);
          const provider = opts.provider ?? new GeminiImageProvider(config);
```
교체:
```ts
          const config = loadConfig(configDir);
          const chosen = backend ?? config.imageBackend;
          const provider =
            opts.provider ??
            (chosen === "gemini" ? new GeminiImageProvider(config) : new PollinationsImageProvider(config));
```

그리고 `/api/config` 블록 **바로 앞**에 키삭제 라우트 추가:
```ts
      if (req.method === "POST" && url.pathname === "/api/config/clear-key") {
        const cfg = clearGeminiKey(configDir);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...cfg, geminiApiKey: maskKey(cfg.geminiApiKey) }));
        return;
      }
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/__tests__/gallery-server.test.ts`
Expected: PASS. 또한 `npx tsc --noEmit` 무오류.

- [ ] **Step 5: Commit**
```bash
git add src/gallery-server.ts src/__tests__/gallery-server.test.ts
git commit -m "feat: /generate 백엔드 선택 + /api/config/clear-key 라우트"
```

---

### Task 4: 설정 UI — 기본 생성기 + 키 관리 (`gallery-settings.ts`)

**Files:** Modify `src/gallery-settings.ts`, `src/__tests__/gallery-settings.test.ts`

- [ ] **Step 1: 테스트 추가** — `src/__tests__/gallery-settings.test.ts`

`describe("renderSettings", () => {` 안 마지막 `it` 뒤에 추가:
```ts
  it("기본 생성기 선택지와 키 관리 UI를 담는다", () => {
    const html = renderSettings({ ...DEFAULT_CONFIG, geminiApiKey: "abcd1234zzzz" });
    expect(html).toContain("기본 이미지 생성기");
    expect(html).toContain("Pollinations");
    expect(html).toContain("✓ 등록됨");
    expect(html).toContain("키 삭제");
    expect(html).toContain("/api/config/clear-key");
  });

  it("키가 없으면 등록 안 됨 표시", () => {
    expect(renderSettings(DEFAULT_CONFIG)).toContain("등록 안 됨");
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/gallery-settings.test.ts`
Expected: FAIL (새 문구 없음)

- [ ] **Step 3: 구현** — `src/gallery-settings.ts` 전체 교체

```ts
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
  const keyStatus = masked ? "✓ 등록됨 (" + escapeHtml(masked) + ")" : "등록 안 됨";
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
  button.minor { margin-top:8px; padding:6px 12px; font-size:13px; background:#bbb; }
  #msg { margin-top:12px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>⚙️ 프롬냥이 설정</h1>

  <label>기본 이미지 생성기</label>
  <select id="imageBackend">
    <option value="pollinations"${config.imageBackend === "pollinations" ? " selected" : ""}>무료 (Pollinations)</option>
    <option value="gemini"${config.imageBackend === "gemini" ? " selected" : ""}>Gemini (키 필요·유료)</option>
  </select>
  <div class="hint">상세창에서 그릴 때마다 바꿀 수도 있어요.</div>

  <label>Gemini API 키</label>
  <div id="keyStatus" class="hint">${keyStatus}</div>
  <input id="geminiApiKey" type="password" placeholder="${masked ? "바꿀 때만 입력" : "키를 붙여넣어 주세요"}">
  <button type="button" class="minor" id="deleteKey">키 삭제</button>
  <div class="hint">Gemini 그림 생성은 결제가 필요해요. 비워두면 기존 키가 유지됩니다.</div>

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
    imageBackend: document.getElementById("imageBackend").value,
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

document.getElementById("deleteKey").addEventListener("click", async function () {
  await fetch("/api/config/clear-key", { method: "POST" });
  document.getElementById("keyStatus").textContent = "등록 안 됨";
  document.getElementById("geminiApiKey").value = "";
  document.getElementById("msg").textContent = "키를 삭제했어요 🗑️";
});
</script>
</body>
</html>`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/__tests__/gallery-settings.test.ts`
Expected: PASS (기존 2 + 신규 2 = 4 tests). 또한 `npx tsc --noEmit` 무오류.

- [ ] **Step 5: Commit**
```bash
git add src/gallery-settings.ts src/__tests__/gallery-settings.test.ts
git commit -m "feat: 설정에 기본 생성기 선택 + Gemini 키 등록상태/삭제 UI"
```

---

### Task 5: 상세창 백엔드 전환 + AI 스튜디오 (`gallery.ts`)

**Files:** Modify `src/gallery.ts`, `src/__tests__/gallery.test.ts`

- [ ] **Step 1: 테스트 추가** — `src/__tests__/gallery.test.ts`

`describe("renderGallery", () => {` 안, 기존 "상세창용 생성 UI..." `it` 뒤에 추가:
```ts
  it("백엔드 선택칸과 AI 스튜디오 버튼을 담는다", () => {
    const html = renderGallery([entry]);
    expect(html).toContain("AI 스튜디오에서 만들기");
    expect(html).toContain("Pollinations"); // 백엔드 선택칸
    expect(html).toContain("aistudio.google.com");
    expect(html).toContain("backend:"); // /generate 본문에 backend 포함
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/gallery.test.ts`
Expected: FAIL (새 문구 없음)

- [ ] **Step 3: 구현** — `src/gallery.ts`

(3-1) `<script>` 안의 `const MODULES = ${data};` 줄 바로 아래에 추가:
```js
let DEFAULT_BACKEND = "pollinations";
fetch("/api/config").then(function (r) { return r.json(); }).then(function (c) { if (c && c.imageBackend) DEFAULT_BACKEND = c.imageBackend; }).catch(function () {});
```

(3-2) `openDetail` 함수에서 `// 🎨 생성 버튼 + 결과 영역` 주석부터 `  sheet.appendChild(result);` 줄까지(그 사이의 genBtn 정의·result·existing·genBtn click 핸들러·`sheet.appendChild(genBtn);`·`sheet.appendChild(result);` 전부)를 아래로 교체. (`document.getElementById("modal").classList.add("open");` 줄은 그대로 남긴다.)

```js
  // 백엔드 선택 + 🎨 생성 + AI 스튜디오
  const tools = document.createElement("div"); tools.className = "row";
  const backendSel = document.createElement("select");
  backendSel.style.cssText = "flex:0 0 auto;padding:6px;border:1px solid #ddd;border-radius:6px";
  backendSel.innerHTML = '<option value="pollinations">무료 (Pollinations)</option><option value="gemini">Gemini 키</option>';
  backendSel.value = DEFAULT_BACKEND;
  const genBtn = document.createElement("button");
  genBtn.className = "copy"; genBtn.textContent = "🎨 이미지 생성";
  genBtn.style.cssText = "background:#ff8fab;color:#fff;border:none;padding:10px 16px";
  const studioBtn = document.createElement("button");
  studioBtn.className = "copy"; studioBtn.textContent = "✨ AI 스튜디오에서 만들기";
  studioBtn.style.cssText = "padding:10px 16px";
  tools.append(backendSel, genBtn, studioBtn);

  const result = document.createElement("div"); result.style.marginTop = "10px";
  const existing = imgStrip(m.dir, m.generatedImages || []);
  if (existing) result.appendChild(existing);

  function assemble() {
    let out = m.result.fullPrompt;
    m.result.variableElements.forEach(function (e) {
      const v = (inputs[e.id].value || "").trim() || e.value;
      out = out.split(e.placeholder).join(v);
    });
    return out;
  }

  studioBtn.addEventListener("click", function () {
    navigator.clipboard.writeText(assemble());
    window.open("https://aistudio.google.com/", "_blank");
  });

  genBtn.addEventListener("click", async function () {
    const overrides = {};
    Object.keys(inputs).forEach(function (id) { overrides[id] = inputs[id].value; });
    genBtn.disabled = true; genBtn.textContent = "그리는 중... 🐱";
    try {
      const res = await fetch("/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dir: m.dir, overrides: overrides, backend: backendSel.value }),
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

  sheet.appendChild(tools);
  sheet.appendChild(result);
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/__tests__/gallery.test.ts`
Expected: PASS (기존 6 + 신규 1 = 7 tests). 또한 `npx tsc --noEmit` 무오류.

- [ ] **Step 5: Commit**
```bash
git add src/gallery.ts src/__tests__/gallery.test.ts
git commit -m "feat: 상세창 백엔드 전환 선택칸 + AI 스튜디오 핸드오프 버튼"
```

---

### Task 6: 전체 검증 + 서버 재시작 + 병합

**Files:** (없음 — 검증/병합만)

- [ ] **Step 1: 타입검사 + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 타입 OK, 전체 PASS(기존 49 + 신규 약 7 = 약 56개).

- [ ] **Step 2: 서버 재시작(새 코드 반영)**

```bash
pkill -f "gallery-server" 2>/dev/null; sleep 1
./scripts/open-gallery.sh
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4517/settings
```
Expected: 200.

- [ ] **Step 3: 수동 end-to-end 확인**

1. 고양이 우클릭 → ⚙️ 설정 → "기본 이미지 생성기", "키 삭제" 버튼, 등록 상태가 보인다.
2. 갤러리 → 카드 → 상세창에 백엔드 선택칸(무료/Gemini) + 🎨 + ✨ AI 스튜디오 버튼.
3. 백엔드 "무료" 상태로 🎨 → 키 없이 그림이 나온다(Pollinations).
4. ✨ AI 스튜디오 → 프롬프트 복사 + 새 탭 열림.

- [ ] **Step 4: master에 병합**
```bash
git checkout master
git merge feat/image-backends
npx vitest run
git branch -d feat/image-backends
```
Expected: 병합, 테스트 PASS, 가지 삭제.

---

## 메모 / 위험요소

- Pollinations는 공용 무료 서비스라 가끔 느리거나 실패할 수 있다(에러 메시지로 표시됨). 그때는 다시 누르거나 Gemini로 전환.
- 서버는 코드 변경 후 반드시 재시작해야 새 라우트/UI가 반영된다(`open-gallery.sh`는 떠있는 서버를 재사용).
- Gemini는 결제가 켜진 키여야 그림이 나온다(무료 키는 이미지 한도 0).
