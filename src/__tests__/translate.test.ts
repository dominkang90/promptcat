import { describe, it, expect } from "vitest";
import { translateToEnglish } from "../translate.js";
import { DEFAULT_CONFIG } from "../config.js";

const withKey = { ...DEFAULT_CONFIG, geminiApiKey: "k-1234" };

describe("translateToEnglish", () => {
  it("키가 없으면 원문 그대로(네트워크 호출 안 함)", async () => {
    const noCall = (() => {
      throw new Error("fetch가 호출되면 안 됨");
    }) as unknown as typeof fetch;
    const out = await translateToEnglish("귀여운 고양이", DEFAULT_CONFIG, noCall);
    expect(out).toBe("귀여운 고양이");
  });

  it("가짜 fetch로 번역 결과를 돌려준다", async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "a cute cat" }] } }] }),
        { status: 200 },
      );
    const out = await translateToEnglish("귀여운 고양이", withKey, fakeFetch as unknown as typeof fetch);
    expect(out).toBe("a cute cat");
  });

  it("실패하면 원문으로 폴백", async () => {
    const fakeFetch = async () => new Response("nope", { status: 500 });
    const out = await translateToEnglish("귀여운 고양이", withKey, fakeFetch as unknown as typeof fetch);
    expect(out).toBe("귀여운 고양이");
  });
});
