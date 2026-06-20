import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createGalleryServer } from "../gallery-server.js";
import type { ImageProvider } from "../image-provider.js";

const good = {
  imageType: "제품",
  fullPrompt: "warm shot",
  fixedElements: [],
  variableElements: [],
  negativePrompt: "",
  notes: "",
};

let base: string;
afterEach(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

async function setup() {
  base = await mkdtemp(path.join(tmpdir(), "promptcat-srv-"));
  const d = path.join(base, "product-20260101-000000");
  await mkdir(d, { recursive: true });
  await writeFile(path.join(d, "prompt.json"), JSON.stringify(good), "utf8");
  await writeFile(path.join(d, "image.png"), Buffer.from([0x89, 0x50]));
}

describe("createGalleryServer", () => {
  it("/ 는 갤러리 HTML, 이미지 라우트는 파일, 경로 탈출은 거부", async () => {
    await setup();
    const server = createGalleryServer(base);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const home = await fetch(`http://localhost:${port}/`);
      expect(home.status).toBe(200);
      expect(await home.text()).toContain("제품");

      const img = await fetch(`http://localhost:${port}/img/product-20260101-000000/image.png`);
      expect(img.status).toBe(200);

      const bad = await fetch(`http://localhost:${port}/img/..%2f..%2fetc%2fpasswd`);
      expect(bad.status).toBe(403);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("POST /generate 는 그림을 만들어 저장한다", async () => {
    await setup();
    const fake: ImageProvider = {
      async generate() {
        return { data: Buffer.from([1, 2, 3]), mediaType: "image/png" };
      },
    };
    const server = createGalleryServer(base, { provider: fake, translate: async (t) => t });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dir: "product-20260101-000000", overrides: {} }),
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { files: string[] };
      expect(json.files.length).toBe(1);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("POST /generate 실패 시 에러 메시지를 JSON으로 준다", async () => {
    await setup();
    const fake: ImageProvider = {
      async generate() {
        throw new Error("키없음");
      },
    };
    const server = createGalleryServer(base, { provider: fake, translate: async (t) => t });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dir: "product-20260101-000000", overrides: {} }),
      });
      expect(res.status).toBe(500);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain("키없음");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("POST /api/config/clear-key 는 키를 비운다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-clrkey-"));
    const server = createGalleryServer(base, { configDir: base });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      await fetch(`http://localhost:${port}/api/config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ geminiApiKey: "delete-me-5555" }),
      });
      const cleared = await fetch(`http://localhost:${port}/api/config/clear-key`, { method: "POST" });
      const cfg = (await cleared.json()) as { geminiApiKey: string };
      expect(cfg.geminiApiKey).toBe("");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("설정 라우트: 저장→조회가 되고 빈 키는 유지된다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-cfgsrv-"));
    const server = createGalleryServer(base, { configDir: base });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const page = await fetch(`http://localhost:${port}/settings`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("설정");

      const firstPost = await fetch(`http://localhost:${port}/api/config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageCount: 3, geminiApiKey: "save-me-4242" }),
      });
      const firstJson = (await firstPost.json()) as { geminiApiKey: string };
      expect(firstJson.geminiApiKey).toBe("****4242");
      await fetch(`http://localhost:${port}/api/config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ geminiApiKey: "" }),
      });
      const got = await fetch(`http://localhost:${port}/api/config`);
      const cfg = (await got.json()) as { imageCount: number; geminiApiKey: string };
      expect(cfg.imageCount).toBe(3);
      expect(cfg.geminiApiKey).toBe("****4242"); // 마스킹 + 유지
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("POST /delete 는 모듈 폴더를 지우고, 폴더 밖 경로는 거부한다", async () => {
    await setup();
    const server = createGalleryServer(base);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const bad = await fetch(`http://localhost:${port}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dir: "../../etc" }),
      });
      expect(bad.status).toBe(403);

      const ok = await fetch(`http://localhost:${port}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dir: "product-20260101-000000" }),
      });
      expect(ok.status).toBe(200);
      const home = await fetch(`http://localhost:${port}/`);
      expect(await home.text()).not.toContain("product-20260101-000000"); // 목록에서 사라짐
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("POST /reorder 는 .order.json 에 순서를 저장한다", async () => {
    await setup();
    const server = createGalleryServer(base);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/reorder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: ["product-20260101-000000"] }),
      });
      expect(res.status).toBe(200);
      const saved = JSON.parse(await readFile(path.join(base, ".order.json"), "utf8"));
      expect(saved).toEqual(["product-20260101-000000"]);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("GET /mascot.png 는 마스코트 이미지를 준다", async () => {
    base = await mkdtemp(path.join(tmpdir(), "promptcat-mascot-"));
    const server = createGalleryServer(base);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/mascot.png`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/png");
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.length).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
