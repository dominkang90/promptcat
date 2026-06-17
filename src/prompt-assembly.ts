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
