import type { ModuleEntry } from "./collection.js";
import type { ExtractionResult } from "./schema.js";

// 프롬프트에서 자동 태그를 뽑는다: 유형 + 각 요소의 종류(category). 중복 제거.
export function tagsFor(result: ExtractionResult): string[] {
  const raw = [
    result.imageType,
    ...result.fixedElements.map((e) => e.category),
    ...result.variableElements.map((e) => e.category),
  ];
  return [...new Set(raw.map((s) => s.trim()).filter(Boolean))];
}

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
      const tags = tagsFor(e.result);
      const chips = tags.map((t) => `#${escapeHtml(t)}`).join(" ");
      const src = `/img/${encodeURIComponent(e.dir)}/${encodeURIComponent(e.imageFile)}`;
      return `<div class="card" draggable="true" data-dir="${escapeHtml(e.dir)}" data-search="${escapeHtml(searchText)}" data-tags="|${escapeHtml(tags.join("|"))}|" onclick="openDetail(${i})">
  <button class="del" title="삭제" onclick="event.stopPropagation();delModule(this)">🗑️</button>
  <img src="${src}" alt="" draggable="false">
  <div class="type">${escapeHtml(e.result.imageType)}</div>
  <div class="dir">${escapeHtml(e.dir)}</div>
  <div class="tags">${chips}</div>
</div>`;
    })
    .join("\n");

  // 화면 위쪽 태그 버튼들 (전체 + 모든 프롬프트의 태그 모음)
  const allTags = [...new Set(entries.flatMap((e) => tagsFor(e.result)))];
  const tagbar = `<div class="tagbar" id="tagbar"><button class="tag active" data-tag="">전체</button>${allTags
    .map((t) => `<button class="tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`)
    .join("")}</div>`;

  const body = entries.length
    ? `<div class="grid" id="grid">\n${cards}\n</div>`
    : `<div class="empty"><img class="empty-cat" src="/mascot.png" alt=""><p>아직 먹인 사진이 없어요</p></div>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>프롬냥이 컬렉션</title>
<style>
  body { font-family: system-ui, sans-serif; margin:0; background:#faf7f5; color:#333; }
  header { padding:16px; position:sticky; top:0; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  h1 { font-size:18px; margin:0 0 8px; display:flex; align-items:center; gap:8px; }
  h1 .logo { height:36px; width:auto; }
  .empty img.empty-cat { width:160px; height:auto; display:block; margin:0 auto 12px; }
  #q { width:100%; padding:10px; font-size:15px; border:1px solid #ddd; border-radius:8px; box-sizing:border-box; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:12px; padding:16px; }
  .card { position:relative; background:#fff; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,.1); }
  .card.dragging { opacity:.4; }
  .card img { width:100%; height:130px; object-fit:contain; background:#f0ecea; display:block; }
  .card .type { font-weight:600; padding:6px 8px 0; }
  .card .dir { font-size:11px; color:#999; padding:0 8px 4px; }
  .card .tags { font-size:10px; color:#c0689a; padding:0 8px 8px; word-break:break-all; }
  .card .del { position:absolute; top:6px; right:6px; z-index:2; border:none; background:rgba(0,0,0,.55); color:#fff; border-radius:6px; padding:3px 7px; font-size:13px; cursor:pointer; opacity:0; transition:opacity .12s; }
  .card:hover .del { opacity:1; }
  .tagbar { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .tag { border:1px solid #e3d9d4; background:#fff; color:#666; border-radius:999px; padding:3px 10px; font-size:12px; cursor:pointer; }
  .tag.active { background:#ff8fab; color:#fff; border-color:#ff8fab; }
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
  /* 편집 팝업의 요소 카드 */
  #elbox { display:flex; flex-direction:column; gap:6px; margin:8px 0; }
  .elcard { border:1px solid #eee; border-radius:8px; padding:8px 10px; background:#fbf8f7; cursor:grab; }
  .elcard.dragging { opacity:.4; }
  .elcat { font-size:12px; color:#888; margin-bottom:2px; }
  .elcat .ph { color:#c0689a; }
  .elval { font-weight:600; word-break:break-word; }
  .eledit { width:100%; padding:6px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box; }
  .elbtns { margin-top:4px; display:flex; gap:6px; }
  .elbtns button { border:1px solid #ddd; background:#fff; border-radius:6px; padding:2px 8px; cursor:pointer; }
  .saveModule { background:#ff8fab; color:#fff; border:none; padding:10px 16px; border-radius:6px; cursor:pointer; }
  /* 라이브러리 피커 */
  #picker .sheet { max-width:560px; }
  #pickerSearch { width:100%; padding:8px; margin:8px 0; border:1px solid #ddd; border-radius:8px; box-sizing:border-box; }
  #pickerBody { display:flex; flex-direction:column; gap:6px; }
  .pkitem { border:1px solid #eee; border-radius:8px; padding:8px 10px; background:#fbf8f7; }
  .pkthumbs { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px; }
  .pkdir { font-size:10px; color:#999; background:#f0ecea; border-radius:4px; padding:1px 6px; }
  .pkval { font-weight:600; word-break:break-word; }
  .pkbtns { margin-top:4px; display:flex; gap:6px; }
  .pkbtns button { border:1px solid #ddd; background:#fff; border-radius:6px; padding:2px 8px; cursor:pointer; }
</style>
</head>
<body>
<header>
  <h1><img class="logo" src="/mascot.png" alt="프롬냥이"> 프롬냥이 컬렉션</h1>
  <input id="q" placeholder="🔍 검색 (유형·단어)">
  ${tagbar}
</header>
${body}

<div class="modal" id="modal">
  <div class="sheet" id="sheet"></div>
</div>

<div class="modal" id="picker">
  <div class="sheet">
    <button class="close" onclick="document.getElementById('picker').classList.remove('open')">×</button>
    <h2 id="pickerTitle"></h2>
    <input id="pickerSearch" placeholder="🔍 검색">
    <div id="pickerBody"></div>
  </div>
</div>

<script>
const MODULES = ${data};

// 클라이언트용 HTML escape (innerHTML에 값을 넣을 때 사용)
function escapeHtmlJs(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

let DEFAULT_BACKEND = "pollinations";
fetch("/api/config").then(function (r) { return r.json(); }).then(function (c) { if (c && c.imageBackend) DEFAULT_BACKEND = c.imageBackend; }).catch(function () {});

// 검색어 + 선택한 태그를 함께 적용해서 카드를 거른다
let currentTag = "";
function applyFilter() {
  const t = (document.getElementById("q").value || "").trim().toLowerCase();
  document.querySelectorAll(".card").forEach(function (c) {
    const okText = !t || c.dataset.search.indexOf(t) !== -1;
    const okTag = !currentTag || c.dataset.tags.indexOf("|" + currentTag + "|") !== -1;
    c.style.display = okText && okTag ? "" : "none";
  });
}
document.getElementById("q").addEventListener("input", applyFilter);
document.querySelectorAll("#tagbar .tag").forEach(function (b) {
  b.addEventListener("click", function () {
    currentTag = this.dataset.tag;
    document.querySelectorAll("#tagbar .tag").forEach(function (x) { x.classList.remove("active"); });
    this.classList.add("active");
    applyFilter();
  });
});

// 삭제: 확인 후 서버에 지우고 카드 제거
function delModule(btn) {
  const card = btn.closest(".card");
  if (!confirm("이 프롬프트를 삭제할까요? 되돌릴 수 없어요 😿")) return;
  fetch("/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dir: card.dataset.dir }),
  })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.ok) card.remove(); else alert("삭제 실패 😿"); })
    .catch(function () { alert("삭제 실패 😿"); });
}

// 드래그로 순서 바꾸기 → 서버에 새 순서 저장
function saveOrder() {
  const grid = document.getElementById("grid");
  if (!grid) return;
  const order = [].map.call(grid.querySelectorAll(".card"), function (c) { return c.dataset.dir; });
  fetch("/reorder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order: order }),
  }).catch(function () {});
}
(function () {
  const grid = document.getElementById("grid");
  if (!grid) return;
  let dragEl = null;
  grid.querySelectorAll(".card").forEach(function (c) {
    c.addEventListener("dragstart", function () { dragEl = c; c.classList.add("dragging"); });
    c.addEventListener("dragend", function () { c.classList.remove("dragging"); saveOrder(); });
    c.addEventListener("dragover", function (e) {
      e.preventDefault();
      if (!dragEl || dragEl === c) return;
      const r = c.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2 || (e.clientY < r.bottom && e.clientX < r.left + r.width / 2);
      grid.insertBefore(dragEl, before ? c : c.nextSibling);
    });
  });
})();

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

  // 편집용 요소 상태를 MODULES[i]에서 복제(원본 안 건드리게)
  EDIT = {
    dir: m.dir,
    fixed: m.result.fixedElements.map(function (e) { return { id: e.id, category: e.category, value: e.value }; }),
    variable: m.result.variableElements.map(function (e) { return { id: e.id, category: e.category, value: e.value, placeholder: e.placeholder }; }),
  };
  const elbox = document.createElement("div"); elbox.id = "elbox"; sheet.appendChild(elbox);
  const saveBtn = document.createElement("button");
  saveBtn.className = "saveModule"; saveBtn.textContent = "💾 저장";
  saveBtn.addEventListener("click", saveModule);
  sheet.appendChild(saveBtn);
  renderEdit();

  // 변동요소: 🎨 생성용 수정 입력칸(요소 카드와 별개로 한 번 그리기용 override 입력)
  const inputs = {};
  m.result.variableElements.forEach(function (e) {
    const wrap = document.createElement("div"); wrap.className = "row";
    const k = document.createElement("div"); k.className = "k"; k.textContent = "↳ " + e.category;
    const inp = document.createElement("input");
    inp.setAttribute("data-var", e.id);
    inp.value = e.value;
    inp.style.cssText = "flex:1;padding:6px;border:1px solid #ddd;border-radius:6px";
    inputs[e.id] = inp;
    wrap.append(k, inp); sheet.appendChild(wrap);
  });

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
  document.getElementById("modal").classList.add("open");
}

function closeDetail() {
  document.getElementById("modal").classList.remove("open");
}

// ── 편집 팝업의 요소 카드 ──────────────────────────────
// 열 때 MODULES[i]에서 복제해 담는다: { dir, fixed:[...], variable:[...] }
let EDIT = null;

// 카드 한 장(요소 하나)을 만든다
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

// 값을 input으로 바꿔 그 자리에서 수정
function editElement(group, idx, card) {
  const inp = document.createElement("input");
  inp.className = "eledit"; inp.value = EDIT[group][idx].value;
  inp.onkeydown = function (ev) { if (ev.key === "Enter") commit(); };
  inp.onblur = commit;
  function commit() { EDIT[group][idx].value = inp.value; renderEdit(); }
  card.querySelector(".elval").replaceWith(inp); inp.focus();
}

// 카드 묶음을 다시 그린다
function renderEdit() {
  const box = document.getElementById("elbox");
  if (!box) return;
  box.innerHTML = "";
  EDIT.fixed.forEach(function (_, i) { box.appendChild(elCard("fixed", i)); });
  EDIT.variable.forEach(function (_, i) { box.appendChild(elCard("variable", i)); });
  wireElDrag(box);
}

// 같은 그룹(fixed/variable) 안에서만 드래그로 순서 바꾸기
function wireElDrag(box) {
  let dragEl = null;
  box.querySelectorAll(".elcard").forEach(function (c) {
    c.addEventListener("dragstart", function () { dragEl = c; c.classList.add("dragging"); });
    c.addEventListener("dragend", function () {
      c.classList.remove("dragging");
      // 화면 순서대로 EDIT 배열을 다시 만든다(그룹별)
      ["fixed", "variable"].forEach(function (g) {
        const order = [].filter.call(box.querySelectorAll('.elcard[data-group=' + g + ']'), function () { return true; });
        EDIT[g] = order.map(function (el) { return EDIT[g][Number(el.dataset.idx)]; });
      });
      renderEdit();
    });
    c.addEventListener("dragover", function (e) {
      e.preventDefault();
      if (!dragEl || dragEl === c || dragEl.dataset.group !== c.dataset.group) return;
      const r = c.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      box.insertBefore(dragEl, before ? c : c.nextSibling);
    });
  });
}

// 편집된 요소를 서버에 저장
function saveModule() {
  fetch("/api/module/update", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ dir: EDIT.dir, fixedElements: EDIT.fixed, variableElements: EDIT.variable }),
  }).then(function (r) { return r.json(); })
    .then(function (d) { alert(d && d.ok ? "저장됐어요 😺" : "저장 실패 😿"); })
    .catch(function () { alert("저장 실패 😿"); });
}

// B2에서 채운다(라이브러리 피커)
function openPicker() {}
</script>
</body>
</html>`;
}
