import type { ExtractionResult } from "./schema.js";

// 생성 프롬프트 = 유형 + "반드시 반영: <체크된 요소>" + 전체 프롬프트(빈칸 채움).
// selection: '반드시 반영'에 넣을 요소 id 목록(체크된 것). 주지 않으면 모든 요소를 넣는다.
//            빈 배열이면 강조 구절을 빼고 전체 프롬프트만 붙인다.
// 전체 프롬프트의 {{빈칸}}은 체크 여부와 무관하게 항상 변동요소 값으로 채운다(리터럴 토큰 방지).
export function assemblePrompt(
  result: ExtractionResult,
  overrides: Record<string, string> = {},
  selection?: string[],
): string {
  const included = selection ? new Set(selection) : null;
  const isIn = (id: string) => !included || included.has(id);
  const clean = (v: string) => (v ?? "").trim();
  const varValue = (el: { id: string; value: string }) => {
    const raw = overrides[el.id];
    return clean(raw !== undefined && raw.trim() !== "" ? raw : el.value);
  };

  // 체크된 요소(우선): 고정 먼저, 변동 나중
  const checked: string[] = [];
  for (const el of result.fixedElements) {
    if (isIn(el.id) && clean(el.value)) checked.push(clean(el.value));
  }
  for (const el of result.variableElements) {
    if (isIn(el.id)) {
      const v = varValue(el);
      if (v) checked.push(v);
    }
  }

  // 전체 프롬프트: 변동요소 빈칸을 값으로 채운다
  let full = result.fullPrompt ?? "";
  for (const el of result.variableElements) {
    if (el.placeholder) full = full.split(el.placeholder).join(varValue(el));
  }
  full = clean(full);

  const segments: string[] = [];
  if (clean(result.imageType)) segments.push(clean(result.imageType));
  if (checked.length) segments.push("반드시 반영: " + checked.join(", "));
  if (full) segments.push(full);
  return segments.join(", ");
}
