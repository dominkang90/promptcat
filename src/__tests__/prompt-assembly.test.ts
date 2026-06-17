import { describe, it, expect } from "vitest";
import { assemblePrompt } from "../prompt-assembly.js";
import type { ExtractionResult } from "../schema.js";

const result: ExtractionResult = {
  imageType: "일러스트",
  fullPrompt: "{{캐릭터}}이(가) {{소품}}과 함께 있다",
  fixedElements: [],
  variableElements: [
    { id: "char", category: "주인공", value: "고양이", placeholder: "{{캐릭터}}" },
    { id: "prop", category: "사물", value: "하트", placeholder: "{{소품}}" },
  ],
  negativePrompt: "",
  notes: "",
};

describe("assemblePrompt", () => {
  it("override 값으로 빈칸을 채운다", () => {
    const out = assemblePrompt(result, { char: "강아지" });
    expect(out).toBe("강아지이(가) 하트과 함께 있다");
  });

  it("override가 없으면 저장된 값으로 채운다", () => {
    expect(assemblePrompt(result, {})).toBe("고양이이(가) 하트과 함께 있다");
  });

  it("결과에 빈칸 토큰이 남지 않는다", () => {
    const out = assemblePrompt(result, { char: "여우", prop: "별" });
    expect(out).not.toContain("{{");
    expect(out).toBe("여우이(가) 별과 함께 있다");
  });
});
