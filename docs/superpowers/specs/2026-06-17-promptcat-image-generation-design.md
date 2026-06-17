# D단계 — 이미지 생성 + 설정 패널 설계

작성일: 2026-06-17
상태: 승인됨 (구현 대기)

## 한 줄 요약

갤러리 상세창에서 모듈의 변동 요소를 고쳐 넣고 🎨 버튼을 누르면, 빈칸을 채운 프롬프트로 Gemini가 그림을 만들어 그 모듈 폴더에 저장하고 바로 보여준다. 고양이 우클릭 메뉴의 "⚙️ 설정"으로 브라우저 설정 페이지를 열어 API 키 등 다양한 설정을 직접 바꿀 수 있다.

## 배경 / 목적

지금까지(A·B·C)는 사진을 먹여 프롬프트를 모듈로 모으고, 갤러리에서 둘러보며 복사하는 것까지 된다. D단계는 모은 프롬프트를 **실제 그림으로 만드는** 마지막 고리다. 프롬냥이의 핵심 가치인 "프롬프트를 모듈로 쪼개 재사용"을, 변동 요소를 바꿔 새 그림을 뽑는 형태로 완성한다.

또한 지금은 API 키가 코드/`.env`에 박혀 있어 사용자가 직접 바꾸기 어렵다. 설정 패널을 만들어 키 입력과 주요 옵션을 GUI로 다룰 수 있게 한다.

## 기술 선택

- **이미지 생성기: Google Gemini 이미지 모델**(`gemini-2.5-flash-image`, 무료 AI Studio 키).
  - 이유: Claude/Codex는 그림 생성 불가. GPT는 구독 로그인으로 자동 생성하는 공식 길이 없음. Gemini는 무료 키로 시작 가능(하루 사용량 제한 있음). 새 키 발급 5분.
- **설정 UI: 기존 로컬 서버에 붙인 웹 페이지**.
  - 이유: 키 붙여넣기·입력은 웹 폼이 tkinter 창보다 편하고, 서버가 이미 있어 추가 의존성 0.

## 범위 (이번에 만드는 것)

- 변동 요소를 (수정 가능하게) 채워 프롬프트를 완성하는 순수 함수
- Gemini로 그림을 만드는 provider (테스트용으로 fetch 주입 가능)
- 생성을 묶어 모듈 폴더에 저장(`gen-*.png` + 기록 json)
- 서버에 `POST /generate` 창구 추가
- 갤러리 상세창: 변동요소 입력칸 + 🎨 생성 버튼 + 결과 표시 + 예전 생성물 다시 보기
- 설정 페이지(웹) + `promptcat-config.json` 저장 + 고양이 우클릭 "⚙️ 설정"

## 범위 밖 (이번엔 안 함)

- 테마 적용(E)
- 이미지 편집/인페인팅, 업스케일
- 여러 모듈 묶어 한 번에 생성(배치 큐)
- 로그인/인증, 외부 공유

## 구성 요소

작고 한 가지 일만 하는 단위로 나눈다.

### 1. `src/prompt-assembly.ts` — 프롬프트 조립 (순수 함수)
- `assemblePrompt(result: ExtractionResult, overrides: Record<string, string>): string`
- `fullPrompt`의 `{{placeholder}}` 토큰을 값으로 치환한다.
- `overrides`는 변동요소 `id` → 새 값. 비어 있으면 그 요소의 저장된 `value`로 채운다.
- 결과에 빈칸(`{{}}`)이 남지 않는다(안 채운 칸은 원래 값으로 자동 채움).

### 2. `src/image-provider.ts` — Gemini 이미지 생성
- `interface ImageProvider { generate(prompt: string): Promise<GeneratedImage> }`
- `GeneratedImage = { data: Buffer; mediaType: string }`
- `GeminiImageProvider`: 설정에서 키/모델/비율을 받아 Gemini REST를 호출, 응답에서 base64 이미지를 꺼내 Buffer로 반환.
- 테스트를 위해 `fetch`를 주입할 수 있게 만든다(진짜 호출 없이 요청 구성/응답 파싱 검증).
- 키 없음·API 오류·이미지 없는 응답은 명확한 Error로 던진다.

### 3. `src/generate.ts` — 생성 묶기
- `generateForModule(baseDir, dir, overrides, provider, config): Promise<GenerateResult>`
- 모듈 `prompt.json`을 읽어 `assemblePrompt` → `provider.generate` → 모듈 폴더에 저장.
- 저장: `gen-<YYYYMMDD-HHMMSS>.png` + `gen-<...>.json`(쓴 프롬프트·overrides 기록).
- 반환: 만든 파일명과 쓴 프롬프트.

### 4. `src/config.ts` — 설정 저장소
- `loadConfig(): PromptcatConfig`, `saveConfig(patch): PromptcatConfig`
- 파일: 프로젝트 루트 `promptcat-config.json`(없으면 기본값).
- 항목:
  - `geminiApiKey: string`
  - `imageModel: string`(기본 `gemini-2.5-flash-image`)
  - `aspectRatio: string`(기본 `1:1`; 1:1·3:4·4:3·16:9·9:16)
  - `imageCount: number`(1~4, 기본 1)
  - `extractionMode: "subscription" | "api"`(기본 `subscription`)
- 키 읽기 우선순위: config 파일 → 환경변수(`GEMINI_API_KEY`) 폴백.

### 5. `src/gallery-settings.ts` — 설정 페이지 HTML (순수 함수)
- `renderSettings(config: PromptcatConfig): string`
- 폼: 위 5개 항목. **키는 `****1234`처럼 가려서** 표시(마스킹), 새로 입력할 때만 덮어씀.
- 저장 버튼 → `POST /api/config`. 저장 성공/실패 안내.

### 6. `src/gallery-server.ts` — 라우트 추가
- `POST /generate` : body `{ dir, overrides }` → `generateForModule` → `{ file, prompt }` 반환.
- `GET /settings` : `renderSettings(loadConfig())` HTML.
- `GET /api/config` : 현재 설정(키 마스킹).
- `POST /api/config` : 받은 patch를 `saveConfig`(빈 키 값은 무시해 기존 키 유지).
- 테스트를 위해 `createGalleryServer`가 `ImageProvider`를 주입받을 수 있게 한다(기본은 `GeminiImageProvider`).

### 7. `src/collection.ts` — gen 목록 포함
- `ModuleEntry`에 `generatedImages: string[]` 추가(`gen-` 로 시작하는 이미지 파일).
- 원본 썸네일(`imageFile`)은 `image.*`(또는 `gen-`이 아닌 첫 이미지)로 고른다.

### 8. `src/gallery.ts` — 상세창 손보기
- 상세창에 변동요소마다 **입력칸**(기본값=저장된 value) + **🎨 이미지 생성** 버튼.
- 클릭 → `POST /generate` → 돌아온 그림을 상세창에 표시(append, 새로고침 불필요).
- 상세창 진입 시 `generatedImages`를 한 줄(스트립)로 보여줘 예전 생성물도 보이게 한다.

### 9. `cat.pyw` — 설정 메뉴 (깃 밖, 직접 적용)
- 우클릭 메뉴에 `"⚙️ 설정"` 추가 → `open-gallery.sh`로 서버 주소를 받아 `/settings`를 브라우저로 연다.
- 기존 클릭(이동)/더블클릭(갤러리)/드롭(먹이기)은 그대로.

## 데이터 흐름

```
[그림 생성]
상세창에서 변동요소 값 수정 → 🎨 생성 클릭
  → POST /generate {dir, overrides}
  → assemblePrompt 로 프롬프트 완성
  → GeminiImageProvider 가 그림 생성 (설정의 키/모델/비율 사용)
  → 모듈 폴더에 gen-*.png + gen-*.json 저장 → 파일명 반환
  → 상세창에 그림 표시 (다시 열어도 generatedImages 로 보임)

[설정]
고양이 우클릭 "⚙️ 설정"
  → open-gallery.sh 로 서버 주소 → /settings 를 브라우저로 엶
  → 폼 수정 후 저장 → POST /api/config → promptcat-config.json 갱신
```

## 에러 처리

- `geminiApiKey` 없음(config·env 둘 다) → 상세창에 "그림 열쇠(키)가 없어요 — ⚙️ 설정에서 넣어 주세요".
- Gemini API 오류/하루 사용량 초과 → 상세창에 메시지 표시(상태코드/본문 일부).
- 응답에 이미지 없음 → 명확한 안내.
- 안 채운 변동요소 빈칸 → 원래 값으로 자동 채움(결과에 `{{}}` 없음).
- `/api/config` 저장 시 빈 키 값은 무시(실수로 키 지우는 것 방지).

## 보안 메모

- `promptcat-config.json`은 로컬 개인용. 키를 평문 저장하되 깃에는 올리지 않는다(`.gitignore`에 추가).
- 브라우저로 키를 돌려줄 때는 마스킹(끝 4자리만). 저장은 새 값이 있을 때만.

## 테스트 전략 (TDD)

- `prompt-assembly`: 치환(override 있음/없음), 빈칸 미잔존, 여러 토큰.
- `image-provider`: 가짜 fetch로 요청 URL/본문 구성, base64 응답 파싱, 키 없음/오류 throw.
- `generate`: 가짜 ImageProvider로 파일 저장(gen-*.png, gen-*.json) + 반환값.
- `config`: 임시 폴더에서 load 기본값/save 라운드트립/빈 키 무시.
- `gallery-settings`: renderSettings에 항목·마스킹 키 포함.
- `gallery-server`: `POST /generate`(가짜 provider, 200+파일), `GET/POST /api/config`.
- `gallery`: 상세창에 입력칸·생성 버튼·gen 스트립 포함.
- `collection`: `generatedImages` 채워짐, 썸네일은 원본.

## 성공 기준

- ⚙️ 설정에서 Gemini 키를 넣고 저장하면 다시 열어도 (마스킹된 채) 유지된다.
- 갤러리 상세창에서 변동요소를 바꿔 🎨 생성하면 새 그림이 뜨고, 모듈 폴더에 저장된다.
- 다시 갤러리를 열면 예전 생성물이 보인다.
- 키가 없거나 오류면 사용자에게 친절한 안내가 뜬다.
- 단위 테스트 통과 + 타입검사 통과.
