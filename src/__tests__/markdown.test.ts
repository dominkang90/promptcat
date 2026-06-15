import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../markdown.js";
import type { ExtractionResult } from "../schema.js";

const result: ExtractionResult = {
  imageType: "제품 사진",
  fullPrompt: "warm product shot",
  fixedElements: [{ id: "light", category: "조명", value: "따뜻한 햇살" }],
  variableElements: [
    { id: "subject", category: "주인공", value: "고양이", placeholder: "{{주인공}}" },
  ],
  negativePrompt: "blurry",
  notes: "관찰 기반",
};

describe("renderMarkdown", () => {
  it("유형/전체프롬프트/고정/변동 항목을 포함한다", () => {
    const md = renderMarkdown(result);
    expect(md).toContain("제품 사진");
    expect(md).toContain("warm product shot");
    expect(md).toContain("조명");
    expect(md).toContain("{{주인공}}");
    expect(md).toContain("blurry");
  });
});
