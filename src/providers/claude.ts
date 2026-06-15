import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { VisionProvider, VisionAnalyzeInput } from "./types.js";
import { extractionResultSchema } from "../schema.js";

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
    const response = await this.#client.messages.parse({
      model: this.#model,
      max_tokens: 4096,
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
      output_config: {
        format: zodOutputFormat(extractionResultSchema),
      },
    });

    return response.parsed_output;
  }
}
