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
