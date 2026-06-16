import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listModules } from "./collection.js";
import { renderGallery } from "./gallery.js";

const PORT = 4517;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export function createGalleryServer(baseDir: string): http.Server {
  const root = path.resolve(baseDir);
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname === "/") {
        const html = renderGallery(await listModules(baseDir));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (url.pathname.startsWith("/img/")) {
        const rel = decodeURIComponent(url.pathname.slice("/img/".length));
        const full = path.resolve(root, rel);
        if (full !== root && !full.startsWith(root + path.sep)) {
          res.writeHead(403);
          res.end("forbidden");
          return;
        }
        const data = await readFile(full);
        res.writeHead(200, { "content-type": MIME[path.extname(full).toLowerCase()] ?? "application/octet-stream" });
        res.end(data);
        return;
      }

      res.writeHead(404);
      res.end("not found");
    } catch {
      res.writeHead(500);
      res.end("error");
    }
  });
}

// tsx로 직접 실행하면 서버를 켠다.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createGalleryServer("modules").listen(PORT, () => {
    console.log(`http://localhost:${PORT}`);
  });
}
