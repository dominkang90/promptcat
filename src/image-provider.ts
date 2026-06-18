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
    generationConfig: { responseModalities: ["IMAGE"] },
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

const SIZES: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "3:4": { width: 768, height: 1024 },
  "4:3": { width: 1024, height: 768 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
};

export function aspectToSize(aspect: string): { width: number; height: number } {
  return SIZES[aspect] ?? { width: 1024, height: 1024 };
}

export function buildPollinationsUrl(prompt: string, config: PromptcatConfig): string {
  const { width, height } = aspectToSize(config.aspectRatio);
  const enc = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${enc}?width=${width}&height=${height}&nologo=true`;
}

// 키·결제가 필요 없는 무료 생성기(Flux 기반).
export class PollinationsImageProvider implements ImageProvider {
  readonly #config: PromptcatConfig;
  readonly #fetch: typeof fetch;

  constructor(config: PromptcatConfig, fetchFn: typeof fetch = fetch) {
    this.#config = config;
    this.#fetch = fetchFn;
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    const url = buildPollinationsUrl(prompt, this.#config);
    const res = await this.#fetch(url);
    if (!res.ok) {
      throw new Error(`Pollinations 오류 ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf, mediaType: "image/jpeg" };
  }
}
