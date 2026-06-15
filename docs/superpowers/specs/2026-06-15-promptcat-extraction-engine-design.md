# PromptCat — B 단계: 프롬프트 추출 엔진 설계

작성일: 2026-06-15
상태: 승인됨 (설계 확정)

---

## 맥락 (왜 만드는가)

바탕화면에 사는 반응형 고양이 캐릭터에게 사진을 "먹이"처럼 주면(드래그&드롭/스크린 캡처/붙여넣기),
고양이가 그 사진을 **재사용 가능한 이미지 생성 프롬프트**로 바꿔서 폴더처럼 정리해주는 데스크톱 앱을
만들고자 한다. 최종 앱은 5개의 독립적인 하위 시스템으로 구성된다:

- **A 바탕화면 고양이** — 떠다니는 반응형 캐릭터 (입력 받기)
- **B 프롬프트 추출 엔진** — 사진 → 프롬프트 + 고정/변동 요소 분리 ← **이 문서의 범위**
- **C 폴더 저장소** — 고양이=폴더, 하위폴더, 모듈 정리
- **D 이미지 생성** — 변동요소/전체/모듈 단위로 새 이미지 만들기
- **E 테마 적용** — 이미지 업로드 + 테마 입혀 새 이미지

심장에 해당하는 **B를 가장 먼저** 만든다. UI 없이 코드로 핵심("사진 넣으면 프롬프트 나온다")을
먼저 검증한 뒤, 나머지를 그 위에 얹는다. 이 문서는 B 한 덩어리만 다룬다.

추출 로직의 원리는 기존 `chromex` 프로젝트의
`packages/extension/src/sidepanel/image-prompt-extraction-prompt.ts`
(`createAdaptiveImagePromptExtractionPrompt`)에서 가져와 재활용한다.

---

## 확정된 결정 사항

| 항목 | 결정 |
|---|---|
| 언어/런타임 | TypeScript / Node (chromex 로직 재활용 + 이후 Electron 데스크톱 앱까지 한 언어로 연결) |
| AI 연결 방식 | 어댑터 + BYOK(사용자가 자기 API 키 입력). 첫 구현은 Claude |
| 기본 비전 모델 | Claude `claude-opus-4-8` (어댑터 구조라 추후 GPT·Gemini 추가 가능) |
| split 생성 방식 | AI 단일 호출로 구조화(JSON) 결과를 한 번에 받음 |
| 저장 형식 | JSON(기계용) + Markdown(사람용) 둘 다 |

> **중요 구분:** "사진 읽는 뇌(비전 텍스트 LLM: Claude/GPT/Gemini)"와
> "그림 만드는 뇌(이미지 생성 모델: Nano Banana/GPT Image)"는 다르다.
> B는 **사진 읽는 뇌**만 사용한다. 이미지 생성 모델은 이후 D/E 단계의 별도 슬롯이다.

---

## 아키텍처 (작게 쪼갠 단위)

각 단위는 하나의 명확한 책임을 가지며, 인터페이스로 소통하고, 독립적으로 테스트 가능하다.

| 단위 | 파일(예정) | 책임 | 의존 |
|---|---|---|---|
| AI 어댑터 | `src/providers/types.ts`, `src/providers/claude.ts` | 어떤 비전 AI든 동일한 인터페이스로 호출. BYOK 키 사용 | Anthropic SDK |
| 추출 지시문 | `src/extraction-prompt.ts` | chromex 지시문 재활용 + "JSON으로 답하라"로 개조 | 없음 |
| 결과 스키마 | `src/schema.ts` | 결과 모양 정의 + 검증 (zod) | zod |
| 엔진 | `src/engine.ts` | 사진 로드 → 지시문 생성 → 어댑터 호출 → 스키마 검증 → 결과 반환 | 위 단위들 |
| 저장기 | `src/storage.ts` | 모듈 1개를 폴더로 저장 (사진 + prompt.json + prompt.md) | schema |
| CLI | `src/cli.ts` | `npm run extract <사진>` 로 화면 없이 실행/테스트 | engine, storage |

### AI 어댑터 인터페이스
```ts
export interface VisionProvider {
  analyze(input: { imageBase64: string; mediaType: string; instruction: string }): Promise<unknown>;
}
```
- `ClaudeProvider`가 첫 구현. 모델 `claude-opus-4-8`, adaptive thinking, 구조화 출력(`output_config.format`) 사용.
- 키는 설정/환경변수(`ANTHROPIC_API_KEY`)에서 읽는다. (BYOK)
- 추후 `OpenAIProvider`, `GeminiProvider`를 같은 인터페이스로 추가할 수 있다. (B에서는 Claude만 구현)

---

## 데이터 흐름

```
사진파일
  → engine: 파일 읽기 + base64 인코딩
  → extraction-prompt: JSON 출력용 지시문 생성
  → provider(Claude 비전): 분석 호출
  → schema(zod): 결과 검증 (실패 시 1회 재시도)
  → storage: 모듈 폴더로 저장
```

## 결과 스키마 (ExtractionResult)

```jsonc
{
  "imageType": "제품 사진",           // 유형 판별 (사진/제품/UI/포스터/...)
  "fullPrompt": "전체 프롬프트 문장...",
  "fixedElements": [                  // 안 바꾸는 뼈대 = 테마
    { "id": "light",  "category": "조명",   "value": "따뜻한 햇살, 부드러운 그림자" },
    { "id": "camera", "category": "카메라", "value": "50mm 느낌, 얕은 심도" }
  ],
  "variableElements": [              // 갈아끼우는 슬롯 = 모듈 빈칸
    { "id": "subject", "category": "주인공",   "value": "고양이", "placeholder": "{{주인공}}" },
    { "id": "color",   "category": "색상테마", "value": "베이지톤", "placeholder": "{{색상}}" }
  ],
  "negativePrompt": "피해야 할 요소...",
  "notes": "관찰한 사실 vs 추정 구분 메모"
}
```

`fixedElements`/`variableElements` 분리가 앱 전체의 모듈화를 가능하게 하는 핵심이다.
변동요소만 바꿔 끼우면 같은 분위기의 새 이미지를 만들 수 있다(이후 D/E 단계).

## 저장 모양 (디스크)

```
modules/<slug>-<timestamp>/
  image.jpg          # 원본 사진
  prompt.json        # 기계용 (ExtractionResult 그대로)
  prompt.md          # 사람용 (읽기 좋은 문서)
```

(고양이=폴더, 하위폴더 등 전체 정리 체계는 다음 단계 C의 범위. B는 모듈 1개 저장까지만.)

---

## 에러 처리 (최소한만)

- API 키 없음 → 명확한 안내 메시지
- 사진 파일 못 읽음/지원하지 않는 형식 → 명확한 에러
- AI가 스키마에 안 맞는 답을 줌 → 1회 재시도 후 에러
- (일어날 수 없는 상황까지 미리 막지 않는다 — 단순하게 유지)

---

## 테스트 / 성공 기준

**성공 기준:** 사진 한 장을 넣으면 → 유형 + 전체 프롬프트 + 고정/변동 목록이 JSON+MD로 저장된다.

- **단위 테스트** (실제 API 호출 없이, 어댑터는 가짜(mock)로):
  - `schema`: 올바른/잘못된 JSON 검증
  - `extraction-prompt`: 지시문에 필수 항목 포함 여부
  - `storage`: 모듈 폴더에 3개 파일이 올바른 내용으로 생성되는지
  - `engine`: mock provider로 전체 흐름 + 재시도 동작
- **수동 통합 테스트:** 실제 `ANTHROPIC_API_KEY`로 샘플 사진 1장 실행 → `prompt.json`/`prompt.md` 눈으로 확인

---

## 프로젝트 위치 & 이름

- 위치: `/home/rkdtk/promptcat/`
- 작업용 이름: `promptcat` (추후 "프롬냥이" 등으로 변경 가능)

---

## 범위 밖 (B에서 하지 않음)

- 바탕화면 고양이 UI, 애니메이션, 입력(드래그/캡처/붙여넣기) — A 단계
- 폴더 계층/하위폴더/모듈 브라우징 — C 단계
- 이미지 생성, 테마 적용 — D/E 단계
- Claude 외 다른 provider 실제 구현 — 인터페이스만 열어둠
