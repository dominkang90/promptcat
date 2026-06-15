import { ClaudeProvider } from "./providers/claude.js";
import { extractPrompt } from "./engine.js";
import { saveModule } from "./storage.js";

async function main(): Promise<void> {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("사용법: npm run extract -- <이미지경로>");
    process.exit(1);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY 환경변수를 설정해줘.");
    process.exit(1);
  }

  const provider = new ClaudeProvider({ apiKey });
  console.log("🐱 분석 중...");
  const result = await extractPrompt(imagePath, provider);
  const dir = await saveModule({ imagePath, result, baseDir: "modules" });
  console.log(`✨ 완료! 저장 위치: ${dir}`);
  console.log(`유형: ${result.imageType}`);
}

main().catch((err: unknown) => {
  console.error("에러:", err instanceof Error ? err.message : err);
  process.exit(1);
});
