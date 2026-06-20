import { FIXED_CATEGORIES, VARIABLE_CATEGORIES } from "./categories.js";

export interface ExtractionPromptInput {
  outputLanguage?: string;
}

export function createExtractionPrompt(input: ExtractionPromptInput = {}): string {
  const language = input.outputLanguage ?? "한국어";
  const fixedList = FIXED_CATEGORIES.join(", ");
  const variableList = VARIABLE_CATEGORIES.join(", ");
  return [
    "첨부한 이미지를 '해체분석'해서, 그 이미지를 그대로 재현할 수 있는 재사용 가능한 생성 프롬프트를 추출해줘.",
    "이미지 유형을 먼저 판별해줘. 실사 사진, 시네마틱 컷, 인물, 제품, 음식, 인테리어, 건축, 풍경, 매크로, 패션, 과거/다큐, 일러스트, 포스터, 인포그래픽, UI/웹사이트/슬라이드, 소셜 카드, 로고, 텍스트 중심 이미지, 합성 이미지 중 무엇에 가까운지 보고 그 유형에 맞는 항목만 깊게 추출해줘.",
    "먼저 공통 레이어를 반드시 다 읽어: 샷·구도(샷 타입·피사체 위치·여백·시점 높이), 카메라(렌즈 감·촬영 매체·거리감), 조명, 색·그레이딩(화이트밸런스·채도·콘트라스트·색 캐스트), 질감(표면·반사·입자감), 배경·환경.",
    "그다음 '주피사체'를 판별해 피사체별 디테일을 더 깊게 읽어줘. 인물: 헤어·표정·포즈·시선·손·의상 핏/소재·피부 질감. 제품: 용기/형태/캡·재질·마감·반사(라벨 텍스트·로고는 복제하지 말고 형태·위치·색만). 풍경: 지형·식생/건물·하늘/대기·시간대·근경·중경·원경·원근. 음식: 구성·플레이팅·윤기/김/단면·식기·가니시. 동물·사물·인테리어: 형태·재질·표면·공간감.",
    "조명은 반드시 '물리적으로' 서술해줘: 광원의 방향·개수·질(하드/소프트)·그림자 모양과 낙폭·하이라이트 위치.",
    "사진이면 카메라/렌즈 느낌, 초점거리/프레이밍, 조리개/심도, ISO/그레인, 색온도, 노출, 시간대, 광원을 생성용 감각 제어값으로 표현해줘(EXIF 확정값 아님).",
    "고정요소(잘 안 바꾸는 뼈대)와 변동요소(갈아끼우는 슬롯)를 스스로 판단해서 나눠줘.",
    `각 요소의 category 값은 아래 표준 목록에서 골라줘. 고정요소 category: ${fixedList}. 변동요소 category: ${variableList}. 목록에 딱 맞는 게 없으면 가장 가까운 항목을 골라줘.`,
    "각 변동요소에는 {{이름}} 형태의 placeholder를 붙여줘.",
    "변수성 텍스트·개인정보·데이터 값·고유명사·인종/국적 키워드는 프롬프트에 넣지 말고 구조적으로만 설명해줘. 안 읽히는 정보는 추측·날조하지 말고 notes에 '확인 필요'로 적어줘.",
    "negativePrompt에는 매체에 맞는 ANTI-AI 네거티브를 넣어줘: 실사면 'no HDR, no oversaturation, no CGI plastic look, no AI enhancement' 류로, 인물·실사 사진이면 매끈한 플라스틱 피부·과보정을 막고 '보케(bokeh)'는 의도된 경우가 아니면 금지로 적어줘.",
    `모든 설명 문장은 ${language}로 작성해줘. notes는 콤마 키워드 나열이 아니라 '원본에서 무엇을 관찰해 어떻게 반영했는지' 검증 가능한 문장으로 써줘(추정·불명확은 '추정'/'확인 필요'로 분리 표기).`,
    "반드시 아래 형태의 JSON만 출력해줘. 코드블럭이나 다른 말은 붙이지 마.",
    '{ "imageType": string, "fullPrompt": string, "fixedElements": [{"id","category","value"}], "variableElements": [{"id","category","value","placeholder"}], "negativePrompt": string, "notes": string }',
  ].join("\n");
}
