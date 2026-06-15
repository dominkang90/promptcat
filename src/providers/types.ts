export interface VisionAnalyzeInput {
  imageBase64: string;
  mediaType: string;
  instruction: string;
}

export interface VisionProvider {
  analyze(input: VisionAnalyzeInput): Promise<unknown>;
}
