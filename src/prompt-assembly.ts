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
