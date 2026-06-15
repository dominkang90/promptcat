import { describe, it, expect } from "vitest";
import { extractionResultSchema } from "../schema.js";

const valid = {
  imageType: "제품 사진",
  fullPrompt: "warm product shot on wooden table",
  fixedElements: [{ id: "light", category: "조명", value: "따뜻한 햇살" }],
  variableElements: [
    { id: "subject", category: "주인공", value: "고양이", placeholder: "{{주인공}}" },
  ],
  negativePrompt: "blurry",
  notes: "관찰 기반",
};

describe("extractionResultSchema", () => {
  it("올바른 객체를 통과시킨다", () => {
    const result = extractionResultSchema.parse(valid);
    expect(result.imageType).toBe("제품 사진");
    expect(result.variableElements[0].placeholder).toBe("{{주인공}}");
  });

  it("negativePrompt와 notes가 없으면 빈 문자열로 채운다", () => {
    const { negativePrompt, notes, ...rest } = valid;
    const result = extractionResultSchema.parse(rest);
    expect(result.negativePrompt).toBe("");
    expect(result.notes).toBe("");
  });

  it("imageType이 없으면 실패한다", () => {
    const { imageType, ...rest } = valid;
    expect(() => extractionResultSchema.parse(rest)).toThrow();
  });
});
