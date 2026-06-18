import { describe, it, expect } from "vitest";
import {
  buildGeminiRequest,
  parseGeminiImage,
  GeminiImageProvider,
  aspectToSize,
  buildPollinationsUrl,
  PollinationsImageProvider,
} from "../image-provider.js";
import { DEFAULT_CONFIG } from "../config.js";

const config = { ...DEFAULT_CONFIG, geminiApiKey: "k-1234", aspectRatio: "16:9" };

describe("buildGeminiRequest", () => {
  it("모델·프롬프트를 담고 aspectRatio는 빼서 400을 피한다", () => {
    const { url, body } = buildGeminiRequest("고양이 그림", config);
    expect(url).toContain(config.imageModel);
    expect(body).toContain("고양이 그림");
    expect(body).toContain("IMAGE");
    expect(body).not.toContain("aspectRatio");
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

describe("aspectToSize", () => {
  it("비율을 크기로 바꾼다", () => {
    expect(aspectToSize("16:9")).toEqual({ width: 1280, height: 720 });
    expect(aspectToSize("1:1")).toEqual({ width: 1024, height: 1024 });
    expect(aspectToSize("이상한값")).toEqual({ width: 1024, height: 1024 });
  });
});

describe("buildPollinationsUrl", () => {
  it("프롬프트와 크기를 담는다", () => {
    const url = buildPollinationsUrl("귀여운 고양이", config);
    expect(url).toContain("image.pollinations.ai/prompt/");
    expect(url).toContain(encodeURIComponent("귀여운 고양이"));
    expect(url).toContain("width=1280");
    expect(url).toContain("height=720");
    expect(url).toContain("model=flux");
  });
});

describe("PollinationsImageProvider", () => {
  it("가짜 fetch로 그림 바이트를 받는다", async () => {
    const fakeFetch = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    const provider = new PollinationsImageProvider(config, fakeFetch as unknown as typeof fetch);
    const img = await provider.generate("cat");
    expect([...img.data]).toEqual([1, 2, 3]);
    expect(img.mediaType).toBe("image/jpeg");
  });

  it("응답이 실패면 에러", async () => {
    const fakeFetch = async () => new Response("nope", { status: 500 });
    const provider = new PollinationsImageProvider(config, fakeFetch as unknown as typeof fetch);
    await expect(provider.generate("cat")).rejects.toThrow("500");
  });
});
