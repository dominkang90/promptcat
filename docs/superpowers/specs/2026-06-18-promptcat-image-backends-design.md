# D단계 보강 — 무료 생성(Pollinations) + 백엔드 전환 + 키 관리 설계

작성일: 2026-06-18
상태: 승인됨 (구현 대기)

## 배경

D단계에서 Gemini로 이미지를 생성하게 만들었으나, **Gemini API의 무료 티어는 이미지 생성이 불가**(무료 한도 0, 결제 필요)하고, 우리가 보낸 `imageConfig.aspectRatio` 필드는 모델이 거부해 400이 났다. 사용자는 "무료로" 쓰길 원한다.

해결: 키·결제가 필요 없는 **Pollinations.ai**(Flux 기반)를 무료 기본 생성기로 붙이고, 원할 때 **Gemini 키로 전환**할 수 있게 한다. 또한 설정에서 **Gemini 키 등록 상태 확인·삭제**를 제공한다.

## 범위 (이번에 만드는 것)

- Pollinations 무료 이미지 생성기(키 불필요).
- 이미지 생성 백엔드 전환: 갤러리 상세창 🎨 옆 선택칸(무료 Pollinations / Gemini) + 설정의 "기본 생성기".
- "✨ AI 스튜디오에서 만들기" 버튼: 조립된 프롬프트 복사 + AI 스튜디오 새 탭 열기(무료 Gemini 수동 경로).
- 설정의 Gemini 키 관리: 등록 상태(****1234 / 안 됨) 표시 + 삭제 버튼. 키는 **한 개**.
- Gemini `aspectRatio` 400 버그 수정(요청에서 `imageConfig` 제거).

## 범위 밖

- Gemini 키 여러 개 관리, 키 이름표.
- 테마 적용(E), 이미지 편집/업스케일.
- 브라우저 자동화로 웹앱 무료 할당량 끌어쓰기(약관/안정성 문제로 안 함).

## 구성 요소

### 1. `src/image-provider.ts`
- `buildGeminiRequest` 수정: `generationConfig`에서 `imageConfig.aspectRatio` 제거(`responseModalities: ["IMAGE"]`만). 400 원인 제거.
- 추가: `aspectToSize(aspect): { width, height }` (1:1→1024², 3:4→768×1024, 4:3→1024×768, 16:9→1280×720, 9:16→720×1280, 기본 1024²).
- 추가: `buildPollinationsUrl(prompt, config): string` — `https://image.pollinations.ai/prompt/<enc>?width=&height=&nologo=true`.
- 추가: `PollinationsImageProvider implements ImageProvider` — 키 없이 위 URL을 GET, 바이트를 `{ data: Buffer, mediaType: "image/jpeg" }`로 반환. 테스트용 `fetch` 주입.

### 2. `src/config.ts`
- `PromptcatConfig`에 `imageBackend: "pollinations" | "gemini"` 추가(기본 `"pollinations"`).
- `clearGeminiKey(baseDir): PromptcatConfig` 추가 — `geminiApiKey`를 빈 문자열로 확실히 지움(빈 키 무시 규칙 우회).

### 3. `src/gallery-server.ts`
- `POST /generate`: 본문 `{ dir, overrides, backend? }`. provider = 주입값 ?? (`backend ?? config.imageBackend` === "gemini" ? `GeminiImageProvider` : `PollinationsImageProvider`).
- `POST /api/config/clear-key`: `clearGeminiKey(configDir)` 후 마스킹된 설정 JSON 반환.

### 4. `src/gallery-settings.ts`
- "기본 이미지 생성기" 선택(`imageBackend`: 무료 Pollinations / Gemini) 추가.
- Gemini 키 영역: 등록 상태(`✓ 등록됨 (****1234)` / `등록 안 됨`) + **삭제** 버튼(→ `POST /api/config/clear-key`).

### 5. `src/gallery.ts` (상세창 client JS)
- 🎨 버튼 옆 백엔드 선택칸(무료 Pollinations / Gemini). 페이지 로드시 `/api/config`로 기본값 받아 초기 선택.
- 🎨 생성 시 `/generate`에 `backend` 포함.
- "✨ AI 스튜디오에서 만들기" 버튼: 입력칸 값으로 프롬프트를 client에서 조립→클립보드 복사→`https://aistudio.google.com/` 새 탭.

## 데이터 흐름

```
상세창에서 값 수정 + 백엔드 선택(무료/Gemini) → 🎨
  → POST /generate {dir, overrides, backend}
  → 서버: backend로 provider 결정 (Pollinations 무료 / Gemini 키)
  → 그림 생성 → 모듈 폴더 gen-*.png 저장 → 표시

설정에서 Gemini 키 삭제 → POST /api/config/clear-key → 키 비워짐(마스킹 응답)
"✨ AI 스튜디오" → 프롬프트 복사 + aistudio.google.com 새 탭(사용자가 붙여넣어 무료 생성)
```

## 에러 처리

- Pollinations !ok → "Pollinations 오류 <status>" 표시.
- Gemini 키 없는데 backend=gemini → 기존 "키가 없어요" 에러 표시.
- 삭제 후에는 등록 상태가 "등록 안 됨"으로 바뀜.

## 테스트 전략 (TDD)

- config: `imageBackend` 기본값, `clearGeminiKey` 동작.
- image-provider: `buildGeminiRequest`에 aspectRatio 미포함, `aspectToSize` 매핑, `buildPollinationsUrl` 구성, `PollinationsImageProvider`(가짜 fetch) 성공/실패.
- gallery-server: `/api/config/clear-key`로 키 비워짐; 기존 `/generate`(주입 provider) 유지.
- gallery-settings: 기본 생성기 선택지·키 등록 상태·삭제 버튼 포함.
- gallery: 백엔드 선택칸·AI 스튜디오 버튼·`/generate`에 backend 전달 흔적.

## 성공 기준

- 키 없이 🎨 → Pollinations로 무료 그림 생성.
- 상세창에서 Gemini로 전환 → (결제된 키면) Gemini로 생성.
- 설정에서 키 등록 상태 확인 + 삭제 가능.
- "✨ AI 스튜디오" → 프롬프트 복사 + 사이트 열림.
- Gemini 호출에서 aspectRatio 400 안 남.
- 단위 테스트 + 타입검사 통과.
