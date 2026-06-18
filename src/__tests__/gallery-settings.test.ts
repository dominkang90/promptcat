import { describe, it, expect } from "vitest";
import { renderSettings } from "../gallery-settings.js";
import { DEFAULT_CONFIG } from "../config.js";

describe("renderSettings", () => {
  it("항목과 현재 값을 담는다", () => {
    const html = renderSettings({ ...DEFAULT_CONFIG, imageModel: "gemini-2.5-flash-image", imageCount: 2 });
    expect(html).toContain("설정");
    expect(html).toContain("gemini-2.5-flash-image");
    expect(html).toContain("16:9"); // 비율 선택지
    expect(html).toContain('value="2"'); // imageCount
  });

  it("키는 마스킹해서 보여준다", () => {
    const html = renderSettings({ ...DEFAULT_CONFIG, geminiApiKey: "supersecret-7777" });
    expect(html).toContain("****7777");
    expect(html).not.toContain("supersecret-7777");
  });

  it("기본 생성기 선택지와 키 관리 UI를 담는다", () => {
    const html = renderSettings({ ...DEFAULT_CONFIG, geminiApiKey: "abcd1234zzzz" });
    expect(html).toContain("기본 이미지 생성기");
    expect(html).toContain("Pollinations");
    expect(html).toContain("✓ 등록됨");
    expect(html).toContain("키 삭제");
    expect(html).toContain("/api/config/clear-key");
  });

  it("키가 없으면 등록 안 됨 표시", () => {
    expect(renderSettings(DEFAULT_CONFIG)).toContain("등록 안 됨");
  });
});
