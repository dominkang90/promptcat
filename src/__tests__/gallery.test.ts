import { describe, it, expect } from "vitest";
import { escapeHtml, renderGallery, tagsFor } from "../gallery.js";
import type { ModuleEntry } from "../collection.js";

const entry: ModuleEntry = {
  dir: "제품-20260616-040114",
  imageFile: "image.png",
  generatedImages: [],
  result: {
    imageType: "제품",
    fullPrompt: "따뜻한 제품 사진",
    fixedElements: [{ id: "l", category: "조명", value: "부드러운 햇살" }],
    variableElements: [{ id: "s", category: "주인공", value: "머그컵", placeholder: "{{주인공}}" }],
    negativePrompt: "",
    notes: "",
  },
};

describe("escapeHtml", () => {
  it("위험한 문자를 바꾼다", () => {
    expect(escapeHtml('<b>"x"</b>')).toBe("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
  });

  it("앰퍼샌드를 먼저 이스케이프한다", () => {
    expect(escapeHtml("a&b<c")).toBe("a&amp;b&lt;c");
  });
});

describe("renderGallery", () => {
  it("유형·프롬프트·요소·이미지경로를 담는다", () => {
    const html = renderGallery([entry]);
    expect(html).toContain("제품");
    expect(html).toContain("따뜻한 제품 사진");
    expect(html).toContain("부드러운 햇살");
    expect(html).toContain("/img/%EC%A0%9C%ED%92%88-20260616-040114/image.png");
  });

  it("상세창용 생성 UI(입력칸·버튼)와 생성물 데이터를 담는다", () => {
    const withGen: ModuleEntry = { ...entry, generatedImages: ["gen-20260616-050000.png"] };
    const html = renderGallery([withGen]);
    expect(html).toContain("이미지 생성"); // 🎨 버튼 문구 (클라이언트 JS 안에 포함)
    expect(html).toContain("data-var"); // 변동요소 입력칸을 만드는 setAttribute 코드
    expect(html).toContain("/generate"); // 생성 요청 경로
    expect(html).toContain("gen-20260616-050000.png"); // 생성물 파일명(임베드 데이터에 포함)
  });

  it("백엔드 선택칸과 AI 스튜디오 버튼을 담는다", () => {
    const html = renderGallery([entry]);
    expect(html).toContain("AI 스튜디오에서 만들기");
    expect(html).toContain("Pollinations");
    expect(html).toContain("aistudio.google.com");
    expect(html).toContain("backend:");
  });

  it("비었으면 안내 문구", () => {
    expect(renderGallery([])).toContain("아직 먹인 사진이 없어요");
  });

  it("헤더와 빈 화면에 DeskCat 마스코트 이미지를 쓴다", () => {
    expect(renderGallery([entry])).toContain('src="/mascot.png"'); // 헤더 로고
    expect(renderGallery([])).toContain('src="/mascot.png"'); // 빈 화면 마스코트
  });

  it("자동 태그: 유형+요소종류로 만들고 태그바·카드에 담는다", () => {
    expect(tagsFor(entry.result)).toEqual(["제품", "조명", "주인공"]);
    const html = renderGallery([entry]);
    expect(html).toContain('class="tagbar"');
    expect(html).toContain("전체"); // 태그바의 전체 버튼
    expect(html).toContain('data-tags="|제품|조명|주인공|"'); // 카드의 태그 데이터
  });

  it("카드에 호버 삭제버튼과 드래그 속성을 담는다", () => {
    const html = renderGallery([entry]);
    expect(html).toContain('class="del"'); // 삭제 버튼
    expect(html).toContain("delModule"); // 삭제 함수 호출
    expect(html).toContain("/delete"); // 삭제 요청 경로
    expect(html).toContain('draggable="true"'); // 드래그 가능
    expect(html).toContain("data-dir="); // 어떤 폴더인지
    expect(html).toContain("/reorder"); // 순서 저장 경로
  });

  it("스크립트 깨짐 방지로 < 를 이스케이프한다", () => {
    const evil: ModuleEntry = { ...entry, result: { ...entry.result, fullPrompt: "a</script>b" } };
    const html = renderGallery([evil]);
    expect(html).toContain("\\u003c/script>");
  });

  it("편집 저장·요소편집 JS 훅이 렌더링된다", () => {
    const html = renderGallery([]); // 빈 갤러리여도 스크립트는 포함
    expect(html).toContain("function saveModule");
    expect(html).toContain("function editElement");
    expect(html).toContain("/api/module/update");
  });
});
