import { describe, it, expect } from "vitest";
import { assemblePrompt } from "../prompt-assembly.js";
import type { ExtractionResult } from "../schema.js";

const result: ExtractionResult = {
  imageType: "인물",
  fullPrompt: "(원본 메모는 생성에 안 쓰임)",
  fixedElements: [
    { id: "comp", category: "구도", value: "정면 대칭" },
    { id: "light", category: "조명", value: "부드러운 정면광" },
  ],
  variableElements: [
    { id: "subject", category: "주인공", value: "고양이", placeholder: "{{인물}}" },
  ],
  negativePrompt: "",
  notes: "",
};

describe("assemblePrompt (요소 조립)", () => {
  it("imageType + 고정 + 변동 값을 순서대로 이어붙인다", () => {
    expect(assemblePrompt(result, {})).toBe("인물, 정면 대칭, 부드러운 정면광, 고양이");
  });
  it("변동요소 override가 적용된다", () => {
    expect(assemblePrompt(result, { subject: "여우" })).toBe("인물, 정면 대칭, 부드러운 정면광, 여우");
  });
  it("공백 override는 저장된 값으로 채운다", () => {
    expect(assemblePrompt(result, { subject: "   " })).toBe("인물, 정면 대칭, 부드러운 정면광, 고양이");
  });
  it("빈 값 요소는 건너뛴다", () => {
    const r = { ...result, fixedElements: [{ id: "x", category: "배경", value: "" }] };
    expect(assemblePrompt(r, {})).toBe("인물, 고양이");
  });
});
