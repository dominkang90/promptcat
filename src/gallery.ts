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
  .elinc { font-size:11px; color:#c0689a; display:inline-flex; align-items:center; gap:3px; margin-right:auto; }
  .saveModule { background:#ff8fab; color:#fff; border:none; padding:10px 16px; border-radius:6px; cursor:pointer; }
  .addVar { margin-left:8px; background:#fff; color:#c0689a; border:1px solid #ff8fab; padding:10px 16px; border-radius:6px; cursor:pointer; }
  .seltitle { font-size:13px; font-weight:600; color:#555; margin:14px 0 6px; }
  #selbox { display:flex; flex-direction:column; gap:6px; margin-bottom:8px; }
  .selrow { display:flex; align-items:center; gap:8px; }
  .selk { flex:0 0 90px; font-size:12px; color:#888; word-break:keep-all; }
  .selrow .eledit { flex:1; }
  .selempty { font-size:12px; color:#bbb; padding:4px 0; }
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

  // 편집용 요소 상태를 MODULES[i]에서 복제(원본 안 건드리게). checked: 생성에 포함할지(기본 전부 체크)
  EDIT = {
    dir: m.dir,
    fixed: m.result.fixedElements.map(function (e) { return { id: e.id, category: e.category, value: e.value, checked: true }; }),
    variable: m.result.variableElements.map(function (e) { return { id: e.id, category: e.category, value: e.value, placeholder: e.placeholder, checked: true }; }),
  };
  const elbox = document.createElement("div"); elbox.id = "elbox"; sheet.appendChild(elbox);
  const saveBtn = document.createElement("button");
  saveBtn.className = "saveModule"; saveBtn.textContent = "💾 저장";
  saveBtn.addEventListener("click", saveModule);
  sheet.appendChild(saveBtn);
  const addVarBtn = document.createElement("button");
  addVarBtn.className = "addVar"; addVarBtn.textContent = "➕ 변동요소 추가";
  addVarBtn.addEventListener("click", addVariable);
  sheet.appendChild(addVarBtn);

  // 선택 영역: 체크된 요소만 쌓여서 여기서 값 수정 → 생성에 그대로 반영
  const seltitle = document.createElement("div"); seltitle.className = "seltitle"; seltitle.textContent = "✅ 생성에 쓸 요소 (체크된 것만)";
  sheet.appendChild(seltitle);
  const selbox = document.createElement("div"); selbox.id = "selbox"; sheet.appendChild(selbox);
  renderEdit();

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

  // 체크된 요소 id 목록(생성에 포함). 유형은 서버가 항상 앞에 붙인다.
  function selectedIds() {
    return EDIT.fixed.concat(EDIT.variable).filter(function (e) { return e.checked; }).map(function (e) { return e.id; });
  }
  // 체크된 요소 우선 + 전체 프롬프트(빈칸 채움) — 백엔드 조립과 동일 규칙(스튜디오 복사용)
  function assemble() {
    const checked = EDIT.fixed.concat(EDIT.variable)
      .filter(function (e) { return e.checked && (e.value || "").trim(); })
      .map(function (e) { return e.value.trim(); });
    let full = m.result.fullPrompt || "";
    EDIT.variable.forEach(function (e) { if (e.placeholder) full = full.split(e.placeholder).join((e.value || "").trim()); });
    const segs = [m.result.imageType];
    if (checked.length) segs.push("반드시 반영: " + checked.join(", "));
    if (full.trim()) segs.push(full.trim());
    return segs.filter(Boolean).join(", ");
  }

  studioBtn.addEventListener("click", function () {
    navigator.clipboard.writeText(assemble());
    window.open("https://aistudio.google.com/", "_blank");
  });

  genBtn.addEventListener("click", async function () {
    genBtn.disabled = true; genBtn.textContent = "그리는 중... 🐱";
    try {
      // 수정한 값이 반영되도록 먼저 저장한 뒤, 체크된 요소만으로 생성한다
      await fetch("/api/module/update", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ dir: EDIT.dir, fixedElements: EDIT.fixed, variableElements: EDIT.variable }),
      });
      const res = await fetch("/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dir: m.dir, backend: backendSel.value, selection: selectedIds() }),
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
  var ph = group === "variable" ? ' <span class="ph">' + escapeHtmlJs(e.placeholder || "") + "</span>" : "";
  // 포함 체크칸: 체크된 요소만 생성에 쓰인다(기본 체크)
  var inc = '<label class="elinc"><input type="checkbox" data-a="inc"' + (e.checked ? " checked" : "") + "> 포함</label>";
  card.innerHTML =
    '<div class="elcat">' + escapeHtmlJs(e.category) + ph + "</div>" +
    '<div class="elval">' + escapeHtmlJs(e.value) + "</div>" +
    '<div class="elbtns">' + inc + '<button data-a="edit">✏️</button><button data-a="pick">🔄</button><button data-a="del">🗑️</button></div>';
  card.querySelector('[data-a=edit]').onclick = function () { editElement(group, idx, card); };
  card.querySelector('[data-a=del]').onclick = function () { EDIT[group].splice(idx, 1); renderEdit(); };
  card.querySelector('[data-a=pick]').onclick = function () { openPicker(e.category, group, idx); };
  card.querySelector('[data-a=inc]').onchange = function () { EDIT[group][idx].checked = this.checked; renderEdit(); };
  return card;
}

// 선택 영역의 한 줄(체크된 요소): 카테고리 + 그 자리에서 값 수정
function selRow(group, idx) {
  const e = EDIT[group][idx];
  const row = document.createElement("div"); row.className = "selrow";
  const k = document.createElement("div"); k.className = "selk"; k.textContent = e.category;
  const inp = document.createElement("input");
  inp.className = "eledit"; inp.value = e.value;
  inp.oninput = function () { EDIT[group][idx].value = inp.value; };
  row.append(k, inp);
  return row;
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

// 카드 묶음 + 선택 영역을 다시 그린다
function renderEdit() {
  const box = document.getElementById("elbox");
  if (!box) return;
  box.innerHTML = "";
  EDIT.fixed.forEach(function (_, i) { box.appendChild(elCard("fixed", i)); });
  EDIT.variable.forEach(function (_, i) { box.appendChild(elCard("variable", i)); });
  wireElDrag(box);

  // 선택 영역: 체크된 요소만 수정 가능하게 쌓아 보여준다
  const sel = document.getElementById("selbox");
  if (!sel) return;
  sel.innerHTML = "";
  EDIT.fixed.forEach(function (e, i) { if (e.checked) sel.appendChild(selRow("fixed", i)); });
  EDIT.variable.forEach(function (e, i) { if (e.checked) sel.appendChild(selRow("variable", i)); });
  if (!sel.children.length) {
    const empty = document.createElement("div"); empty.className = "selempty";
    empty.textContent = "체크된 요소가 없어요 — 유형만으로 생성돼요";
    sel.appendChild(empty);
  }
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

// 변동요소 새로 추가(카테고리·기본값 입력받아 슬롯 생성). 변동요소는 항상 1순위.
function addVariable() {
  var category = prompt("변동요소 카테고리 (예: 주인공, 포즈·동작)");
  if (!category) return;
  var value = prompt("기본 값 (예: 정면을 보는 인물)");
  if (value === null) return;
  EDIT.variable.push({ id: "new-" + Date.now(), category: category, value: value || "", placeholder: "{{" + category + "}}", checked: true });
  renderEdit();
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

// 라이브러리 피커: 카테고리별 요소를 불러와 고르고, 즐겨찾기·숨김을 토글한다
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
          item.innerHTML =
            '<div class="pkthumbs">' + (el.sources || []).slice(0, 4).map(function (s) {
              return '<span class="pkdir">' + escapeHtmlJs(s) + "</span>"; }).join("") + "</div>" +
            '<div class="pkval">' + escapeHtmlJs(el.value) + "</div>" +
            '<div class="pkbtns"><button data-a="fav">' + (el.favorite ? "★" : "☆") + '</button><button data-a="hide">👁</button><button data-a="use">사용</button></div>';
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
</script>
</body>
</html>`;
}
