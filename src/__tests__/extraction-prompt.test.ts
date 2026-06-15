import { describe, it, expect } from "vitest";
import { createExtractionPrompt } from "../extraction-prompt.js";

describe("createExtractionPrompt", () => {
  it("JSON 출력과 고정/변동 분리를 지시한다", () => {
    const prompt = createExtractionPrompt();
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("고정요소");
    expect(prompt).toContain("변동요소");
    expect(prompt).toContain("placeholder");
  });

  it("출력 언어를 지시문에 반영한다", () => {
    const prompt = createExtractionPrompt({ outputLanguage: "English" });
    expect(prompt).toContain("English");
  });
});
