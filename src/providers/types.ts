export interface VisionAnalyzeInput {
  imageBase64: string;
  mediaType: string;
  instruction: string;
  // 원본 이미지 경로. CLI(구독) provider가 파일을 직접 읽을 때 쓴다.
  imagePath?: string;
}

export interface VisionProvider {
  analyze(input: VisionAnalyzeInput): Promise<unknown>;
}
