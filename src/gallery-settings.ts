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
