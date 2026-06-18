import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export interface PromptcatConfig {
  geminiApiKey: string;
  imageModel: string;
  aspectRatio: string;
  imageCount: number;
  extractionMode: "subscription" | "api";
  imageBackend: "pollinations" | "gemini";
}

export const DEFAULT_CONFIG: PromptcatConfig = {
  geminiApiKey: "",
  imageModel: "gemini-2.5-flash-image",
  aspectRatio: "1:1",
  imageCount: 1,
  extractionMode: "subscription",
  imageBackend: "pollinations",
};

const CONFIG_FILE = "promptcat-config.json";

// 파일+기본값만 (환경변수 폴백 없음). 저장 기준값으로도 쓴다.
function readFileConfig(baseDir: string): PromptcatConfig {
  const file = path.join(baseDir, CONFIG_FILE);
  let fromFile: Partial<PromptcatConfig> = {};
  if (existsSync(file)) {
    try {
      fromFile = JSON.parse(readFileSync(file, "utf8")) as Partial<PromptcatConfig>;
    } catch {
      fromFile = {};
    }
  }
  return { ...DEFAULT_CONFIG, ...fromFile };
}

export function loadConfig(baseDir = "."): PromptcatConfig {
  const merged = readFileConfig(baseDir);
  if (!merged.geminiApiKey) merged.geminiApiKey = process.env.GEMINI_API_KEY ?? "";
  return merged;
}

export function saveConfig(patch: Partial<PromptcatConfig>, baseDir = "."): PromptcatConfig {
  const clean: Partial<PromptcatConfig> = { ...patch };
  // 빈/공백 키는 무시해 실수로 키를 지우지 않게 한다.
  if (clean.geminiApiKey !== undefined && clean.geminiApiKey.trim() === "") {
    delete clean.geminiApiKey;
  }
  const next = { ...readFileConfig(baseDir), ...clean };
  writeFileSync(path.join(baseDir, CONFIG_FILE), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 4) return "****";
  return "****" + key.slice(-4);
}

// 키를 확실히 지운다(빈 키 무시 규칙을 우회).
export function clearGeminiKey(baseDir = "."): PromptcatConfig {
  const next = { ...readFileConfig(baseDir), geminiApiKey: "" };
  writeFileSync(path.join(baseDir, CONFIG_FILE), JSON.stringify(next, null, 2), "utf8");
  return next;
}
