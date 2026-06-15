// 추출한 요소에 붙이는 "표준 카테고리(분류표)" 목록.
// AI가 매번 다른 단어로 적지 않고, 여기 있는 단어 중에서 고르게 해서
// 나중에 여러 모듈을 섞어 쓸 때 짝이 맞게 한다.

export const FIXED_CATEGORIES = [
  "조명",
  "카메라",
  "구도",
  "색감",
  "매체·렌더링",
  "분위기",
  "배경",
] as const;

export const VARIABLE_CATEGORIES = [
  "주인공",
  "사물",
  "색상테마",
  "텍스트",
  "포즈·동작",
  "스타일",
] as const;

export type FixedCategory = (typeof FIXED_CATEGORIES)[number];
export type VariableCategory = (typeof VARIABLE_CATEGORIES)[number];
