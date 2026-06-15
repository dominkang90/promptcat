import { readFile } from "node:fs/promises";
import path from "node:path";
import type { VisionProvider } from "./providers/types.js";
import { createExtractionPrompt } from "./extraction-prompt.js";
import { extractionResultSchema, type ExtractionResult } from "./schema.js";

const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export interface ExtractOptions {
  outputLanguage?: string;
  maxRetries?: number;
}

export async function extractPrompt(
  imagePath: string,
  provider: VisionProvider,
  options: ExtractOptions = {},
): Promise<ExtractionResult> {
  const mediaType = MEDIA_TYPES[path.extname(imagePath).toLowerCase()];
  if (!mediaType) {
    throw new Error(`지원하지 않는 이미지 형식이야: ${imagePath}`);
  }
  const imageBase64 = (await readFile(imagePath)).toString("base64");
  const instruction = createExtractionPrompt({ outputLanguage: options.outputLanguage });
  const maxRetries = options.maxRetries ?? 1;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const raw = await provider.analyze({ imageBase64, mediaType, instruction });
    const parsed = extractionResultSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
    lastError = parsed.error;
  }
  throw new Error(`AI가 올바른 형식으로 답하지 않았어: ${String(lastError)}`);
}
