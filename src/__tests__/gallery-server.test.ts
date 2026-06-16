import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createGalleryServer } from "../gallery-server.js";

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
});
