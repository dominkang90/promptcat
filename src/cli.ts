import { ClaudeProvider } from "./providers/claude.js";
import { extractPrompt } from "./engine.js";
import { saveModule } from "./storage.js";

// .env 파일이 있으면 자동으로 읽어온다. 없으면 그냥 넘어간다.
try {
  process.loadEnvFile();
} catch {
  // .env 파일이 없는 경우 — 환경변수를 직접 넣었을 수 있으니 그대로 진행한다.
}

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
