import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, saveConfig, maskKey, clearGeminiKey, DEFAULT_CONFIG } from "../config.js";

let base: string;
afterEach(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

describe("config", () => {
  it("파일이 없으면 기본값", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-cfg-"));
    const c = loadConfig(base);
    expect(c.imageModel).toBe(DEFAULT_CONFIG.imageModel);
    expect(c.imageCount).toBe(1);
    expect(c.extractionMode).toBe("subscription");
  });

  it("저장하면 다시 읽힌다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-cfg-"));
    saveConfig({ imageCount: 3, geminiApiKey: "secret-key-1234" }, base);
    const c = loadConfig(base);
    expect(c.imageCount).toBe(3);
    expect(c.geminiApiKey).toBe("secret-key-1234");
  });

  it("빈 키 값은 기존 키를 지우지 않는다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-cfg-"));
    saveConfig({ geminiApiKey: "keepme-9999" }, base);
    saveConfig({ geminiApiKey: "   " }, base);
    expect(loadConfig(base).geminiApiKey).toBe("keepme-9999");
  });

  it("maskKey는 끝 4자리만 남긴다", () => {
    expect(maskKey("abcdefgh1234")).toBe("****1234");
    expect(maskKey("")).toBe("");
    expect(maskKey("ab")).toBe("****");
  });

  it("기본 이미지 백엔드는 pollinations", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-cfg-"));
    expect(loadConfig(base).imageBackend).toBe("pollinations");
  });

  it("clearGeminiKey는 키를 비운다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-cfg-"));
    saveConfig({ geminiApiKey: "to-be-removed-1111" }, base);
    const after = clearGeminiKey(base);
    expect(after.geminiApiKey).toBe("");
  });
});
