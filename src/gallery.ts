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
