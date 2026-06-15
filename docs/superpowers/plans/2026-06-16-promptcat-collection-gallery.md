# 컬렉션 갤러리(C단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 떠있는 고양이를 더블클릭하면 로컬 웹 서버가 켜지고, 모은 모듈을 격자 갤러리로 둘러보며 프롬프트(전체/요소)를 복사할 수 있게 한다.

**Architecture:** WSL/Node 쪽에 모듈 목록 읽기(`collection.ts`) → 갤러리 HTML 생성(`gallery.ts`) → 작은 http 서버(`gallery-server.ts`)를 두고, 셸 스크립트(`open-gallery.sh`)가 서버를 켠다. Windows의 고양이(`cat.pyw`)가 더블클릭 시 스크립트를 호출해 받은 주소를 브라우저로 연다.

**Tech Stack:** TypeScript(ESM, NodeNext) · Node 내장 `http`/`fs`(외부 라이브러리 0개) · vitest · tsx · Python tkinter(cat.pyw)

---

## 시작 전

```bash
cd /home/rkdtk/promptcat
git checkout -b feat/collection-gallery
```

## 파일 구조

- Create: `src/collection.ts` — `modules/`를 읽어 `ModuleEntry[]` 반환 (`listModules`)
- Create: `src/__tests__/collection.test.ts`
- Create: `src/gallery.ts` — `ModuleEntry[]` → 갤러리 HTML 문자열 (`renderGallery`, `escapeHtml`)
- Create: `src/__tests__/gallery.test.ts`
- Create: `src/gallery-server.ts` — `createGalleryServer(baseDir)` + 직접 실행 시 4517 포트 리슨
- Create: `src/__tests__/gallery-server.test.ts`
- Create: `scripts/open-gallery.sh` — 서버 없으면 켜고 주소 출력
- Modify: `package.json` — `"gallery"` 스크립트 추가
- Modify: `/mnt/c/Users/rkdtk/promptcat-launcher/cat.pyw` — 더블클릭/메뉴로 갤러리 열기

---

### Task 1: 모듈 목록 읽기 (`collection.ts`)

**Files:**
- Create: `src/collection.ts`
- Test: `src/__tests__/collection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listModules } from "../collection.js";

const good = {
  imageType: "제품",
  fullPrompt: "warm shot",
  fixedElements: [{ id: "l", category: "조명", value: "햇살" }],
  variableElements: [{ id: "s", category: "주인공", value: "고양이", placeholder: "{{주인공}}" }],
  negativePrompt: "",
  notes: "",
};

let base: string;
afterEach(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

async function makeModule(dir: string, withImage = true, json: unknown = good) {
  const d = path.join(base, dir);
  await mkdir(d, { recursive: true });
  if (json !== undefined) await writeFile(path.join(d, "prompt.json"), JSON.stringify(json), "utf8");
  if (withImage) await writeFile(path.join(d, "image.png"), Buffer.from([0x89, 0x50]));
}

describe("listModules", () => {
  it("폴더가 없으면 빈 배열", async () => {
    expect(await listModules("/tmp/promptcat-nope-xyz")).toEqual([]);
  });

  it("유효한 모듈만, 최신 시간순으로 돌려준다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-col-"));
    await makeModule("일러스트-20260616-035841");
    await makeModule("제품-20260616-040114");
    await makeModule("깨진폴더-20260616-050000", true, undefined); // prompt.json 없음
    await makeModule("이미지없음-20260616-060000", false); // 이미지 없음
    const list = await listModules(base);
    expect(list.length).toBe(2);
    expect(list[0].dir).toBe("제품-20260616-040114"); // 040114 > 035841
    expect(list[0].imageFile).toBe("image.png");
    expect(list[0].result.imageType).toBe("제품");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/collection.test.ts`
Expected: FAIL (`../collection.js` 없음)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/collection.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/collection.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/collection.ts src/__tests__/collection.test.ts
git commit -m "feat: modules 폴더를 읽는 listModules 추가"
```

---

### Task 2: 갤러리 HTML 생성 (`gallery.ts`)

**Files:**
- Create: `src/gallery.ts`
- Test: `src/__tests__/gallery.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { escapeHtml, renderGallery } from "../gallery.js";
import type { ModuleEntry } from "../collection.js";

const entry: ModuleEntry = {
  dir: "제품-20260616-040114",
  imageFile: "image.png",
  result: {
    imageType: "제품",
    fullPrompt: "따뜻한 제품 사진",
    fixedElements: [{ id: "l", category: "조명", value: "부드러운 햇살" }],
    variableElements: [{ id: "s", category: "주인공", value: "머그컵", placeholder: "{{주인공}}" }],
    negativePrompt: "",
    notes: "",
  },
};

describe("escapeHtml", () => {
  it("위험한 문자를 바꾼다", () => {
    expect(escapeHtml('<b>"x"</b>')).toBe("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
  });
});

describe("renderGallery", () => {
  it("유형·프롬프트·요소·이미지경로를 담는다", () => {
    const html = renderGallery([entry]);
    expect(html).toContain("제품");
    expect(html).toContain("따뜻한 제품 사진");
    expect(html).toContain("부드러운 햇살");
    expect(html).toContain("/img/%EC%A0%9C%ED%92%88-20260616-040114/image.png");
  });

  it("비었으면 안내 문구", () => {
    expect(renderGallery([])).toContain("아직 먹인 사진이 없어요");
  });

  it("스크립트 깨짐 방지로 < 를 이스케이프한다", () => {
    const evil: ModuleEntry = { ...entry, result: { ...entry.result, fullPrompt: "a</script>b" } };
    const html = renderGallery([evil]);
    expect(html).toContain("\\u003c/script>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/gallery.test.ts`
Expected: FAIL (`../gallery.js` 없음)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/gallery.ts
import type { ModuleEntry } from "./collection.js";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderGallery(entries: ModuleEntry[]): string {
  // 모달용 데이터는 페이지에 JSON으로 심는다. </script> 깨짐 방지로 < 를 이스케이프.
  const data = JSON.stringify(entries).replace(/</g, "\\u003c");

  const cards = entries
    .map((e, i) => {
      const searchText = [
        e.result.imageType,
        e.result.fullPrompt,
        ...e.result.fixedElements.map((x) => `${x.category} ${x.value}`),
        ...e.result.variableElements.map((x) => `${x.category} ${x.value}`),
      ]
        .join(" ")
        .toLowerCase();
      const src = `/img/${encodeURIComponent(e.dir)}/${encodeURIComponent(e.imageFile)}`;
      return `<div class="card" data-search="${escapeHtml(searchText)}" onclick="openDetail(${i})">
  <img src="${src}" alt="">
  <div class="type">${escapeHtml(e.result.imageType)}</div>
  <div class="dir">${escapeHtml(e.dir)}</div>
</div>`;
    })
    .join("\n");

  const body = entries.length
    ? `<div class="grid" id="grid">\n${cards}\n</div>`
    : `<p class="empty">아직 먹인 사진이 없어요 🐱</p>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>프롬냥이 컬렉션</title>
<style>
  body { font-family: system-ui, sans-serif; margin:0; background:#faf7f5; color:#333; }
  header { padding:16px; position:sticky; top:0; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  h1 { font-size:18px; margin:0 0 8px; }
  #q { width:100%; padding:10px; font-size:15px; border:1px solid #ddd; border-radius:8px; box-sizing:border-box; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:12px; padding:16px; }
  .card { background:#fff; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,.1); }
  .card img { width:100%; height:130px; object-fit:contain; background:#f0ecea; display:block; }
  .card .type { font-weight:600; padding:6px 8px 0; }
  .card .dir { font-size:11px; color:#999; padding:0 8px 8px; }
  .empty { text-align:center; color:#999; padding:60px; }
  .modal { position:fixed; inset:0; background:rgba(0,0,0,.5); display:none; align-items:center; justify-content:center; padding:20px; }
  .modal.open { display:flex; }
  .sheet { background:#fff; border-radius:12px; max-width:680px; width:100%; max-height:85vh; overflow:auto; padding:20px; }
  .sheet h2 { margin-top:0; }
  .row { border-top:1px solid #eee; padding:8px 0; display:flex; gap:8px; align-items:flex-start; }
  .row .k { flex:0 0 96px; color:#888; font-size:13px; }
  .row .v { flex:1; white-space:pre-wrap; word-break:break-word; }
  button.copy { flex:0 0 auto; border:1px solid #ddd; background:#f7f4f2; border-radius:6px; padding:4px 10px; cursor:pointer; }
  .close { float:right; border:none; background:none; font-size:22px; cursor:pointer; line-height:1; }
</style>
</head>
<body>
<header>
  <h1>🐱 프롬냥이 컬렉션</h1>
  <input id="q" placeholder="🔍 검색 (유형·단어)">
</header>
${body}

<div class="modal" id="modal">
  <div class="sheet" id="sheet"></div>
</div>

<script>
const MODULES = ${data};

document.getElementById("q").addEventListener("input", function () {
  const t = this.value.trim().toLowerCase();
  document.querySelectorAll(".card").forEach(function (c) {
    c.style.display = !t || c.dataset.search.indexOf(t) !== -1 ? "" : "none";
  });
});

document.getElementById("modal").addEventListener("click", function (e) {
  if (e.target === this) closeDetail();
});

function addRow(parent, k, value) {
  const row = document.createElement("div"); row.className = "row";
  const kk = document.createElement("div"); kk.className = "k"; kk.textContent = k;
  const vv = document.createElement("div"); vv.className = "v"; vv.textContent = value;
  const btn = document.createElement("button"); btn.className = "copy"; btn.textContent = "복사";
  btn.addEventListener("click", function () {
    navigator.clipboard.writeText(value);
    btn.textContent = "복사됨!";
    setTimeout(function () { btn.textContent = "복사"; }, 1000);
  });
  row.append(kk, vv, btn);
  parent.appendChild(row);
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
  m.result.variableElements.forEach(function (e) { addRow(sheet, "변동·" + e.category, e.value + "  " + e.placeholder); });
  document.getElementById("modal").classList.add("open");
}

function closeDetail() {
  document.getElementById("modal").classList.remove("open");
}
</script>
</body>
</html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/gallery.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/gallery.ts src/__tests__/gallery.test.ts
git commit -m "feat: 모듈 목록을 갤러리 HTML로 그리는 renderGallery 추가"
```

---

### Task 3: 로컬 갤러리 서버 (`gallery-server.ts`)

**Files:**
- Create: `src/gallery-server.ts`
- Test: `src/__tests__/gallery-server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createGalleryServer } from "../gallery-server.js";

const good = {
  imageType: "제품",
  fullPrompt: "warm shot",
  fixedElements: [],
  variableElements: [],
  negativePrompt: "",
  notes: "",
};

let base: string;
afterEach(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

async function setup() {
  base = await mkdtemp(path.join(tmpdir(), "promptcat-srv-"));
  const d = path.join(base, "product-20260101-000000");
  await mkdir(d, { recursive: true });
  await writeFile(path.join(d, "prompt.json"), JSON.stringify(good), "utf8");
  await writeFile(path.join(d, "image.png"), Buffer.from([0x89, 0x50]));
}

describe("createGalleryServer", () => {
  it("/ 는 갤러리 HTML, 이미지 라우트는 파일, 경로 탈출은 거부", async () => {
    await setup();
    const server = createGalleryServer(base);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const home = await fetch(`http://localhost:${port}/`);
      expect(home.status).toBe(200);
      expect(await home.text()).toContain("제품");

      const img = await fetch(`http://localhost:${port}/img/product-20260101-000000/image.png`);
      expect(img.status).toBe(200);

      const bad = await fetch(`http://localhost:${port}/img/..%2f..%2fetc%2fpasswd`);
      expect(bad.status).toBe(403);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/gallery-server.test.ts`
Expected: FAIL (`../gallery-server.js` 없음)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/gallery-server.ts
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listModules } from "./collection.js";
import { renderGallery } from "./gallery.js";

const PORT = 4517;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export function createGalleryServer(baseDir: string): http.Server {
  const root = path.resolve(baseDir);
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname === "/") {
        const html = renderGallery(await listModules(baseDir));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
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
        res.writeHead(200, { "content-type": MIME[path.extname(full).toLowerCase()] ?? "application/octet-stream" });
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
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/gallery-server.ts src/__tests__/gallery-server.test.ts
git commit -m "feat: 갤러리/이미지를 서빙하는 작은 로컬 서버 추가"
```

---

### Task 4: 실행 스크립트 (`package.json` + `open-gallery.sh`)

**Files:**
- Modify: `package.json` (scripts 블록)
- Create: `scripts/open-gallery.sh`

- [ ] **Step 1: package.json에 gallery 스크립트 추가**

`package.json`의 `"scripts"`에서 `"extract"` 줄 아래에 추가:

```json
    "extract": "tsx src/cli.ts",
    "gallery": "tsx src/gallery-server.ts"
```

(콤마 위치 주의: `extract` 줄 끝에 콤마가 있어야 한다.)

- [ ] **Step 2: open-gallery.sh 작성**

```bash
# scripts/open-gallery.sh
#!/usr/bin/env bash
# 갤러리 서버가 없으면 켜고, 주소를 한 줄로 출력한다. (고양이가 이 주소를 브라우저로 연다)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=4517

# bash 내장 /dev/tcp 로 포트가 열렸는지 확인 (curl 불필요)
up() { (exec 3<>"/dev/tcp/localhost/$PORT") 2>/dev/null; }

if ! up; then
  nohup npm run --silent gallery >/tmp/promptcat-gallery.log 2>&1 &
  for _ in $(seq 1 30); do
    up && break
    sleep 0.3
  done
fi

echo "http://localhost:$PORT"
```

- [ ] **Step 3: 실행 권한 + 수동 확인**

```bash
chmod +x scripts/open-gallery.sh
./scripts/open-gallery.sh
```
Expected: `http://localhost:4517` 가 출력됨. 이어서 아래로 응답 확인:
```bash
curl -s http://localhost:4517/ | head -c 60
```
Expected: `<!DOCTYPE html>` 로 시작하는 HTML.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/open-gallery.sh
git commit -m "feat: 갤러리 서버 실행 스크립트(open-gallery.sh) + npm 스크립트 추가"
```

---

### Task 5: 고양이에 갤러리 열기 추가 (`cat.pyw`)

**Files:**
- Modify: `/mnt/c/Users/rkdtk/promptcat-launcher/cat.pyw`

- [ ] **Step 1: import에 webbrowser 추가**

`import subprocess` 줄 아래에 추가:

```python
import webbrowser
```

- [ ] **Step 2: open_gallery 함수 추가**

`feed` 함수 정의 바로 아래(=`on_drop` 정의 위)에 추가:

```python
def open_gallery():
    def work():
        proc = subprocess.run(
            ["wsl", "-d", "Ubuntu", "bash", "-lc", "~/promptcat/scripts/open-gallery.sh"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=NO_WINDOW,
        )
        lines = [ln for ln in proc.stdout.strip().splitlines() if ln.strip()]
        url = lines[-1] if lines else ""
        if url.startswith("http"):
            root.after(0, lambda: webbrowser.open(url))
        else:
            root.after(0, lambda: messagebox.showwarning(
                "프롬냥이", "갤러리를 못 열었어 😿\n\n" + tail(proc.stdout + "\n" + proc.stderr)))

    threading.Thread(target=work, daemon=True).start()
```

- [ ] **Step 3: 더블클릭 바인딩 + 메뉴 항목 추가**

`lbl.bind("<Button-1>", start_move)` 위(또는 근처)에 더블클릭 바인딩 추가:

```python
lbl.bind("<Double-Button-1>", lambda e: open_gallery())
```

그리고 우클릭 메뉴 정의에서 `menu.add_command(label="사진 먹이기...", command=pick_file)` 줄 아래에 추가:

```python
menu.add_command(label="📂 컬렉션 열기", command=open_gallery)
```

- [ ] **Step 4: 문법 검사**

Run:
```bash
powershell.exe -NoProfile -Command "py -3 -m py_compile 'C:\Users\rkdtk\promptcat-launcher\cat.pyw'; if ($LASTEXITCODE -eq 0) { 'SYNTAX_OK' } else { 'SYNTAX_FAIL' }"
```
Expected: `SYNTAX_OK`

- [ ] **Step 5: 고양이 재시작(이전 인스턴스 종료 후 새로 실행)**

```bash
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='pythonw.exe'\" | Where-Object { \$_.CommandLine -like '*cat.pyw*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId }; Start-Process -FilePath 'C:\Users\rkdtk\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe' -ArgumentList '\"C:\Users\rkdtk\promptcat-launcher\cat.pyw\"' -WorkingDirectory 'C:\Users\rkdtk\promptcat-launcher'"
```
Expected: 새 고양이가 떠 있고, 더블클릭하면 브라우저에 갤러리가 열린다. (cat.pyw는 깃 저장소 밖이라 커밋 대상 아님)

---

### Task 6: 전체 검증 + 가지 마무리

**Files:** (없음 — 검증/병합만)

- [ ] **Step 1: 타입검사 + 전체 테스트**

Run:
```bash
npx tsc --noEmit && npx vitest run
```
Expected: 타입 OK, 모든 테스트 PASS(기존 18개 + 신규: collection 2, gallery 4, server 1 = 25개).

- [ ] **Step 2: 수동 end-to-end 확인**

1. 고양이에 사진 한 장 먹이기 → "냠냠 다 먹었어".
2. 고양이 더블클릭 → 브라우저에 갤러리 열림, 방금 먹인 카드가 보임.
3. 카드 클릭 → 상세창에서 "전체" 복사 버튼 → 다른 곳(메모장 등)에 붙여넣기 됨.
4. 검색창에 유형 일부 입력 → 카드가 걸러짐.

- [ ] **Step 3: master에 병합**

```bash
git checkout master
git merge feat/collection-gallery
npx vitest run
git branch -d feat/collection-gallery
```
Expected: fast-forward 병합, 테스트 PASS, 가지 삭제.

---

## 메모 / 위험요소

- `open-gallery.sh`의 `nohup ... &` 서버는 WSL이 살아있는 동안 유지된다. WSL이 완전히 종료되면 서버도 꺼지므로, 다음 더블클릭 때 스크립트가 다시 켠다(자동 복구).
- 클립보드 복사는 `localhost`(안전 컨텍스트)라 동작한다. 브라우저가 권한을 물으면 허용해야 한다.
- `cat.pyw`는 깃 저장소(`/home/rkdtk/promptcat`) 밖의 Windows 경로라 버전관리 대상이 아니다. 변경은 직접 적용한다.
