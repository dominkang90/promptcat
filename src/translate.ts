import type { PromptcatConfig } from "./config.js";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TRANSLATE_MODEL = "gemini-2.5-flash";

interface GeminiTextResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

// 한글 등 비영어 프롬프트를 영어로 번역한다(이미지 모델이 영어를 더 잘 알아듣기 때문).
// - 키가 없으면 네트워크 호출 없이 원문을 그대로 돌려준다.
// - 실패하면 원문으로 폴백한다(번역 때문에 이미지 생성이 막히지 않게).
export async function translateToEnglish(
  text: string,
  config: PromptcatConfig,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  if (!config.geminiApiKey) return text;
  try {
    const url = `${ENDPOINT}/${TRANSLATE_MODEL}:generateContent`;
    const body = JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Translate the following image prompt to natural English. Output only the translation, no quotes or notes.\n\n${text}`,
            },
          ],
        },
      ],
    });
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": config.geminiApiKey,
      },
      body,
    });
    if (!res.ok) return text;
    const json = (await res.json()) as GeminiTextResponse;
    const out = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return out || text;
  } catch {
    return text;
  }
}
