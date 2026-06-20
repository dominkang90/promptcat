import { describe, it, expect } from "vitest";
import { assemblePrompt } from "../prompt-assembly.js";
import type { ExtractionResult } from "../schema.js";

const result: ExtractionResult = {
  imageType: "인물",
  fullPrompt: "정면 스튜디오 인물 사진, {{인물}} 묘사",
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

describe("assemblePrompt (체크요소 우선 + 전체 프롬프트)", () => {
  it("selection이 없으면: 유형 + 반드시반영(전체요소) + 전체프롬프트(빈칸 채움)", () => {
    expect(assemblePrompt(result, {})).toBe(
      "인물, 반드시 반영: 정면 대칭, 부드러운 정면광, 고양이, 정면 스튜디오 인물 사진, 고양이 묘사",
    );
  });
  it("override는 체크요소·전체프롬프트 빈칸 둘 다에 적용된다", () => {
    expect(assemblePrompt(result, { subject: "여우" })).toBe(
      "인물, 반드시 반영: 정면 대칭, 부드러운 정면광, 여우, 정면 스튜디오 인물 사진, 여우 묘사",
    );
  });
  it("selection에 든 요소만 '반드시 반영'에 넣고, 전체프롬프트는 그대로 채워 붙인다", () => {
    expect(assemblePrompt(result, {}, ["light", "subject"])).toBe(
      "인물, 반드시 반영: 부드러운 정면광, 고양이, 정면 스튜디오 인물 사진, 고양이 묘사",
    );
  });
  it("selection이 빈 배열이면 강조문구 없이 유형 + 전체프롬프트만", () => {
    expect(assemblePrompt(result, {}, [])).toBe("인물, 정면 스튜디오 인물 사진, 고양이 묘사");
  });
  it("전체프롬프트의 빈칸은 체크 여부와 무관하게 항상 채운다(리터럴 토큰 방지)", () => {
    expect(assemblePrompt(result, {}, [])).not.toContain("{{");
  });
  it("전체프롬프트가 비고 체크요소도 없으면 유형만", () => {
    const r: ExtractionResult = { ...result, fullPrompt: "" };
    expect(assemblePrompt(r, {}, [])).toBe("인물");
  });
});
