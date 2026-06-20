import { describe, it, expect } from "vitest";
import { createExtractionPrompt } from "../extraction-prompt.js";
import { FIXED_CATEGORIES, VARIABLE_CATEGORIES } from "../categories.js";

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

  it("표준 카테고리 목록을 지시문에 담는다", () => {
    const prompt = createExtractionPrompt();
    for (const category of FIXED_CATEGORIES) {
      expect(prompt).toContain(category);
    }
    for (const category of VARIABLE_CATEGORIES) {
      expect(prompt).toContain(category);
    }
  });

  it("피사체별 정밀 해체(인물·제품·풍경·음식)를 지시한다", () => {
    const prompt = createExtractionPrompt();
    expect(prompt).toContain("피사체");
    for (const subject of ["인물", "제품", "풍경", "음식"]) {
      expect(prompt).toContain(subject);
    }
  });

  it("조명을 물리적으로(방향·질·그림자) 서술하게 지시한다", () => {
    const prompt = createExtractionPrompt();
    expect(prompt).toContain("광원");
    expect(prompt).toContain("그림자");
  });

  it("매체에 맞는 ANTI-AI 네거티브와 인물 보케 금지를 negativePrompt에 담게 한다", () => {
    const prompt = createExtractionPrompt();
    expect(prompt).toContain("negativePrompt");
    expect(prompt).toContain("보케");
  });

  it("notes는 검증용 문장(키워드 나열 금지)으로 쓰게 지시한다", () => {
    const prompt = createExtractionPrompt();
    expect(prompt).toContain("notes");
    expect(prompt).toContain("문장");
  });
});
