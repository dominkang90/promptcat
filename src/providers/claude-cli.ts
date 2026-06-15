import { spawn } from "node:child_process";
import type { VisionProvider, VisionAnalyzeInput } from "./types.js";
import { extractJson } from "./extract-json.js";

export interface ClaudeCliProviderOptions {
  // 'claude' 실행 명령(테스트나 경로 지정용). 기본은 PATH의 'claude'.
  command?: string;
}

// 내 컴퓨터에 로그인된 claude CLI(=구독)를 불러서 이미지를 분석한다.
// API 키가 아니라 구독으로 돌아가므로 크레딧이 안 든다.
export class ClaudeCliProvider implements VisionProvider {
  readonly #command: string;

  constructor(options: ClaudeCliProviderOptions = {}) {
    this.#command = options.command ?? "claude";
  }

  async analyze(input: VisionAnalyzeInput): Promise<unknown> {
    if (!input.imagePath) {
      throw new Error("구독 방식은 이미지 파일 경로가 필요해.");
    }
    const prompt = [
      input.instruction,
      "",
      `분석할 이미지 파일: ${input.imagePath}`,
      "그 이미지를 읽어서 위 지시대로 JSON만 출력해. 코드블럭이나 다른 말은 붙이지 마.",
    ].join("\n");

    const text = await this.#run(prompt);
    return JSON.parse(extractJson(text));
  }

  #run(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // API 키가 환경에 있으면 claude가 구독 대신 그걸 쓸 수 있어서 지운다.
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;

      const child = spawn(this.#command, ["-p", prompt, "--allowedTools", "Read"], { env });
      let out = "";
      let err = "";
      child.stdout.on("data", (chunk) => {
        out += chunk;
      });
      child.stderr.on("data", (chunk) => {
        err += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve(out);
        } else {
          reject(new Error(`claude CLI 실패(코드 ${code}): ${err || out}`));
        }
      });
    });
  }
}
