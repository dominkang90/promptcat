import type { PromptcatConfig } from "./config.js";

export interface GeneratedImage {
  data: Buffer;
  mediaType: string;
}

export interface ImageProvider {
  generate(prompt: string): Promise<GeneratedImage>;
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function buildGeminiRequest(
  prompt: string,
  config: PromptcatConfig,
): { url: string; body: string } {
  const url = `${ENDPOINT}/${config.imageModel}:generateContent`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: config.aspectRatio },
    },
  });
  return { url, body };
}

interface GeminiInline {
  data?: string;
  mimeType?: string;
  mime_type?: string;
}
interface GeminiPart {
  inlineData?: GeminiInline;
  inline_data?: GeminiInline;
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

export function parseGeminiImage(json: unknown): GeneratedImage {
  const parts = (json as GeminiResponse).candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = p.inlineData ?? p.inline_data;
    const data = inline?.data;
    if (data) {
      return {
        data: Buffer.from(data, "base64"),
        mediaType: inline?.mimeType ?? inline?.mime_type ?? "image/png",
      };
    }
  }
  throw new Error("Gemini 응답에 이미지가 없어요.");
}

export class GeminiImageProvider implements ImageProvider {
  readonly #config: PromptcatConfig;
  readonly #fetch: typeof fetch;

  constructor(config: PromptcatConfig, fetchFn: typeof fetch = fetch) {
    this.#config = config;
    this.#fetch = fetchFn;
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    if (!this.#config.geminiApiKey) {
      throw new Error("Gemini 키가 없어요. ⚙️ 설정에서 키를 넣어 주세요.");
    }
    const { url, body } = buildGeminiRequest(prompt, this.#config);
    const res = await this.#fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.#config.geminiApiKey,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini 오류 ${res.status}: ${text.slice(0, 200)}`);
    }
    return parseGeminiImage(await res.json());
  }
}
