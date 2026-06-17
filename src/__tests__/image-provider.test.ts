import { describe, it, expect } from "vitest";
import {
  buildGeminiRequest,
  parseGeminiImage,
  GeminiImageProvider,
} from "../image-provider.js";
import { DEFAULT_CONFIG } from "../config.js";

const config = { ...DEFAULT_CONFIG, geminiApiKey: "k-1234", aspectRatio: "16:9" };

describe("buildGeminiRequest", () => {
  it("모델·프롬프트·비율을 담는다", () => {
    const { url, body } = buildGeminiRequest("고양이 그림", config);
    expect(url).toContain(config.imageModel);
    expect(body).toContain("고양이 그림");
    expect(body).toContain("16:9");
  });
});

describe("parseGeminiImage", () => {
  it("inlineData의 base64를 Buffer로 꺼낸다", () => {
    const json = {
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AQID" } }] } }],
    };
    const img = parseGeminiImage(json);
    expect(img.mediaType).toBe("image/png");
    expect([...img.data]).toEqual([1, 2, 3]); // AQID = 0x01 0x02 0x03
  });

  it("이미지가 없으면 에러", () => {
    expect(() => parseGeminiImage({ candidates: [] })).toThrow();
  });
});

describe("GeminiImageProvider", () => {
  it("가짜 fetch로 그림을 만든다", async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AQID" } }] } }] }),
        { status: 200 },
      );
    const provider = new GeminiImageProvider(config, fakeFetch as unknown as typeof fetch);
    const img = await provider.generate("프롬프트");
    expect([...img.data]).toEqual([1, 2, 3]);
  });

  it("키가 없으면 에러", async () => {
    const provider = new GeminiImageProvider({ ...config, geminiApiKey: "" });
    await expect(provider.generate("x")).rejects.toThrow();
  });

  it("응답이 실패면 상태코드를 담아 에러", async () => {
    const fakeFetch = async () => new Response("nope", { status: 429 });
    const provider = new GeminiImageProvider(config, fakeFetch as unknown as typeof fetch);
    await expect(provider.generate("x")).rejects.toThrow("429");
  });
});
