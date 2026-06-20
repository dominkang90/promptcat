# 프롬프트 요소 수집기 (Element Collector) — 설계

작성일: 2026-06-20

## 목표

promptcat 갤러리를 "프롬프트를 구경·생성하는 곳"에서 **"요소(element)를 수집·재사용·편집하는 곳"**으로 키운다.
어느 이미지의 프롬프트에서든 요소(구도·조명·동작 등)를 꺼내 다른 프롬프트에 가져다 쓸 수 있게 한다.

## 핵심 결정 (확정)

1. **새 DB 없음** — 기존 `modules/*/prompt.json`을 모아서 요소 창고로 쓴다.
2. **요소가 주인(source of truth), 문장은 조립** — 그림 생성 시 요소 값들을 이어붙여 프롬프트를 만든다. 기존 줄글 `fullPrompt`는 "원본 메모"로 표시만.
3. **요소 정체성 = `카테고리|값`(정규화)** — 같은 카테고리·같은 값이면 창고에서 하나로 합친다.
4. 화면(UI)은 한 덩어리(`gallery.ts`)라 한 에이전트가 맡고, 백엔드/데이터는 다른 파일이라 별도 에이전트가 병렬로 맡는다.

## 데이터 모델

- `prompt.json` 스키마는 그대로(`fixedElements`, `variableElements`). 추가 저장 필드 없음.
- **요소 창고**: 모든 모듈의 요소를 집계. 항목 = `{ category, value, placeholder?, sources: string[] }` (sources = 그 요소가 등장한 모듈 dir 목록).
- **메타 사이드카** `modules/.elements-meta.json`:
  ```json
  { "구도|정면 대칭 구도...": { "favorite": true, "hidden": false, "order": 3 } }
  ```
  즐겨찾기/숨김/순서만 저장. 원본 prompt.json은 안 건드린다.

## 생성 프롬프트 조립 규칙

```
조립문장 = [imageType, ...요소들의 value(순서대로)].join(", ")
  - 각 요소 값 = 변동요소면 사용자 override 값(없으면 기본 value), 고정요소면 그대로 value.
  - placeholder는 화면 표시·기존 fullPrompt 호환용으로만 보관(조립에선 값 자체를 끼움).
negativePrompt는 기존과 동일하게 전달.
```

- 기존 줄글 `fullPrompt`는 생성에 쓰지 않고 detail에 "원본 메모"로만 노출.
- 편집/교체/삭제는 요소 배열을 바꾸고 `prompt.json`을 저장 → 다음 조립부터 반영.

## 백엔드 라우트 (gallery-server.ts)

| 메서드/경로 | 입력 | 동작 |
|---|---|---|
| `GET /api/elements?category=&q=&includeHidden=` | 쿼리 | 해당 카테고리 창고 요소 목록(값·sources·favorite·hidden), q로 부분검색, 숨김 기본 제외 |
| `POST /api/elements/meta` | `{key, favorite?, hidden?, order?}` | `.elements-meta.json` 갱신 |
| `POST /api/module/update` | `{dir, fixedElements, variableElements}` | 그 모듈 `prompt.json`의 요소 배열 통째 저장(경로 보안 체크) |
| `POST /generate` (수정) | 기존 + 조립 기준 | 요소 조립으로 프롬프트 구성 |

라우트는 기존 패턴(수동 라우팅, JSON 응답, root 경로 보안 체크) 그대로 따른다.

## 프론트 UI (gallery.ts)

### (A) 편집 팝업 — 이미지 클릭
- 좌측: 원본 이미지 + 생성본 스트립.
- 우측: 요소 목록(고정+변동). 각 요소 카드:
  - 누르면 인라인 편집: **값 수정 / 라이브러리에서 가져오기 / 삭제**.
  - 변동요소는 placeholder 표시 유지.
- 드래그로 요소 순서변경.
- 저장 버튼 → `POST /api/module/update`. (고정요소도 이제 편집됨)
- 원본 메모(fullPrompt)·notes·negativePrompt 표시.

### (B) 라이브러리 피커 — 요소의 "가져오기" 클릭
- **그 카테고리만** 필터해서 띄움.
- 그 카테고리 요소들을 **출처 이미지 썸네일 목록**으로 표시.
- 마우스 호버 → 요소 값 **요약 툴팁**.
- 상단 🔍 검색(value 부분일치).
- 각 항목 ⭐즐겨찾기 토글 / 👁숨김 토글 → `POST /api/elements/meta`.
- 드래그로 순서변경 → 메타 order 저장.
- 항목 클릭 → 현재 프롬프트의 **같은 카테고리 요소를 교체**(없으면 추가). 팝업은 편집 팝업 위에 겹쳐 뜨고, 고르면 편집 팝업에 반영.

## 테스트 (vitest, 네트워크 주입)

- **집계**: 여러 모듈에서 요소 모으기, `카테고리|값` 중복 제거, sources 누적.
- **메타 반영**: favorite/hidden/order가 목록에 반영(숨김 제외, 순서 적용).
- **조립**: 요소→문장 조립, 변동 override 적용.
- **라우트**: `/api/elements` 필터·검색, `/api/elements/meta` 저장, `/api/module/update` 저장(+경로 보안).

기존처럼 fetch/provider/translate는 주입해서 실제 네트워크를 타지 않게 한다.

## 병렬 에이전트 분해

공유 계약(위 데이터 모델·라우트 시그니처)을 고정한 뒤:

- **에이전트 A — 백엔드·데이터**: `collection.ts`(집계+메타), 조립 함수, `gallery-server.ts` 새 라우트, `schema.ts` 필요시, `__tests__/*`. (UI 파일 안 건드림)
- **에이전트 B — 화면**: `gallery.ts`의 편집 팝업 + 라이브러리 피커. A가 정의한 라우트를 fetch로 호출.

합치기: 통합 담당(메인)이 typecheck/test 그린 확인 → 브라우저 확인 → 사용자 승인 후 master 커밋.

## 범위 밖 (YAGNI)

- SQLite 등 별도 DB
- 요소 자동 추천/AI 재작성
- 화면 파일을 3갈래로 더 쪼개기(충돌 위험)
- 요소 전역 일괄 수정(한 요소 고치면 모든 프롬프트에 반영) — 이번엔 프롬프트 단위 편집만.
