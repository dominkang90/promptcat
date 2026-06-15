import { describe, it, expect } from "vitest";
import { FIXED_CATEGORIES, VARIABLE_CATEGORIES } from "../categories.js";

describe("표준 카테고리 목록", () => {
  it("고정요소 카테고리는 비어있지 않고 핵심 항목을 담는다", () => {
    expect(FIXED_CATEGORIES.length).toBeGreaterThan(0);
    expect(FIXED_CATEGORIES).toContain("조명");
  });

  it("변동요소 카테고리는 비어있지 않고 핵심 항목을 담는다", () => {
    expect(VARIABLE_CATEGORIES.length).toBeGreaterThan(0);
    expect(VARIABLE_CATEGORIES).toContain("주인공");
  });

  it("두 목록 모두 중복이 없다", () => {
    expect(new Set(FIXED_CATEGORIES).size).toBe(FIXED_CATEGORIES.length);
    expect(new Set(VARIABLE_CATEGORIES).size).toBe(VARIABLE_CATEGORIES.length);
  });
});
