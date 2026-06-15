export interface ExtractionPromptInput {
  outputLanguage?: string;
}

export function createExtractionPrompt(input: ExtractionPromptInput = {}): string {
  const language = input.outputLanguage ?? "한국어";
  return [
    "첨부한 이미지를 분석해서 재사용 가능한 이미지 생성 프롬프트를 추출해줘.",
    "이미지 유형을 먼저 판별해줘. 실사 사진, 시네마틱 컷, 인물, 제품, 음식, 인테리어, 건축, 풍경, 매크로, 패션, 과거/다큐, 일러스트, 포스터, 인포그래픽, UI/웹사이트/슬라이드, 소셜 카드, 로고, 텍스트 중심 이미지, 합성 이미지 중 무엇에 가까운지 보고 그 유형에 맞는 항목만 깊게 추출해줘.",
    "사진이면 카메라/렌즈 느낌, 초점거리/프레이밍, 조리개/심도, ISO/그레인, 색온도, 노출, 시간대, 광원을 생성용 감각 제어값으로 표현해줘(EXIF 확정값 아님).",
    "고정요소(조명/카메라/구도/색감/매체 등 잘 안 바꾸는 뼈대)와 변동요소(주인공/사물/색상테마 등 갈아끼우는 슬롯)를 스스로 판단해서 나눠줘.",
    "각 변동요소에는 {{이름}} 형태의 placeholder를 붙여줘.",
    "변수성 텍스트·개인정보·데이터 값·고유명사는 프롬프트에 넣지 말고 구조적으로만 설명해줘.",
    `모든 설명 문장은 ${language}로 작성해줘.`,
    "반드시 아래 형태의 JSON만 출력해줘. 코드블럭이나 다른 말은 붙이지 마.",
    '{ "imageType": string, "fullPrompt": string, "fixedElements": [{"id","category","value"}], "variableElements": [{"id","category","value","placeholder"}], "negativePrompt": string, "notes": string }',
  ].join("\n");
}
