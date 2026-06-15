import Anthropic from "@anthropic-ai/sdk";
import type { VisionProvider, VisionAnalyzeInput } from "./types.js";

export interface ClaudeProviderOptions {
  apiKey: string;
  model?: string;
}

export class ClaudeProvider implements VisionProvider {
  readonly #client: Anthropic;
  readonly #model: string;

  constructor(options: ClaudeProviderOptions) {
    if (!options.apiKey) {
      throw new Error("ANTHROPIC_API_KEY가 필요해. 설정에서 키를 넣어줘.");
    }
    this.#client = new Anthropic({ apiKey: options.apiKey });
    this.#model = options.model ?? "claude-opus-4-8";
  }

  async analyze(input: VisionAnalyzeInput): Promise<unknown> {
    const message = await this.#client.messages.create({
      model: this.#model,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.mediaType as
                  | "image/png"
                  | "image/jpeg"
                  | "image/gif"
                  | "image/webp",
                data: input.imageBase64,
              },
            },
            { type: "text", text: input.instruction },
          ],
        },
      ],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return JSON.parse(stripFence(text));
  }
}

function stripFence(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : text).trim();
}
