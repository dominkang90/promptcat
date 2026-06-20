import http from "node:http";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listModules } from "./collection.js";
import { renderGallery } from "./gallery.js";
import { loadConfig, saveConfig, maskKey, clearGeminiKey, type PromptcatConfig } from "./config.js";
import { renderSettings } from "./gallery-settings.js";
import { generateForModule } from "./generate.js";
import { translateToEnglish } from "./translate.js";
import { GeminiImageProvider, PollinationsImageProvider, type ImageProvider } from "./image-provider.js";
import { aggregateElements, filterElements, readElementsMeta, writeElementMeta, updateModuleElements } from "./elements.js";

const PORT = 4517;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export interface GalleryServerOptions {
  provider?: ImageProvider; // 테스트에서 가짜 provider 주입
  configDir?: string; // promptcat-config.json 위치 (기본 ".")
  translate?: (text: string, config: PromptcatConfig) => Promise<string>; // 테스트에서 가짜 번역 주입
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function createGalleryServer(baseDir: string, opts: GalleryServerOptions = {}): http.Server {
  const root = path.resolve(baseDir);
  const configDir = opts.configDir ?? ".";
  const translateFn = opts.translate ?? translateToEnglish;

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname === "/") {
        const html = renderGallery(await listModules(baseDir));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.method === "POST" && url.pathname === "/generate") {
        try {
          const { dir, overrides, backend } = JSON.parse(await readBody(req)) as {
            dir: string;
            overrides?: Record<string, string>;
            backend?: string;
          };
          const moduleRoot = path.resolve(root, dir);
          if (moduleRoot !== root && !moduleRoot.startsWith(root + path.sep)) {
            res.writeHead(403, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "forbidden" }));
            return;
          }
          const config = loadConfig(configDir);
          const chosen = backend ?? config.imageBackend;
          const provider =
            opts.provider ??
            (chosen === "gemini" ? new GeminiImageProvider(config) : new PollinationsImageProvider(config));
          const result = await generateForModule({
            baseDir,
            dir,
            overrides: overrides ?? {},
            provider,
            count: config.imageCount,
            translate: (t) => translateFn(t, config),
          });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/delete") {
        try {
          const { dir } = JSON.parse(await readBody(req)) as { dir: string };
          const full = path.resolve(root, dir);
          if (full === root || !full.startsWith(root + path.sep)) {
            res.writeHead(403, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "forbidden" }));
            return;
          }
          await rm(full, { recursive: true, force: true });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/reorder") {
        try {
          const { order } = JSON.parse(await readBody(req)) as { order: string[] };
          await writeFile(path.join(root, ".order.json"), JSON.stringify(order), "utf8");
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/elements") {
        const meta = await readElementsMeta(baseDir);
        const all = aggregateElements(await listModules(baseDir), meta);
        const list = filterElements(all, {
          category: url.searchParams.get("category") ?? undefined,
          q: url.searchParams.get("q") ?? undefined,
          includeHidden: url.searchParams.get("includeHidden") === "1",
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(list));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/elements/meta") {
        const { key, favorite, hidden, order } = JSON.parse(await readBody(req)) as {
          key: string; favorite?: boolean; hidden?: boolean; order?: number;
        };
        await writeElementMeta(baseDir, key, { favorite, hidden, order });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/module/update") {
        try {
          const { dir, fixedElements, variableElements } = JSON.parse(await readBody(req)) as {
            dir: string; fixedElements: unknown[]; variableElements: unknown[];
          };
          const full = path.resolve(root, dir);
          if (full === root || !full.startsWith(root + path.sep)) {
            res.writeHead(403, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "forbidden" }));
            return;
          }
          await updateModuleElements(baseDir, dir, fixedElements as never, variableElements as never);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
        return;
      }

      if (url.pathname === "/settings") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderSettings(loadConfig(configDir)));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/config/clear-key") {
        const cfg = clearGeminiKey(configDir);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...cfg, geminiApiKey: maskKey(cfg.geminiApiKey) }));
        return;
      }

      if (url.pathname === "/api/config") {
        try {
          if (req.method === "POST") {
            const patch = JSON.parse(await readBody(req)) as Partial<PromptcatConfig>;
            saveConfig(patch, configDir);
          }
          const cfg = loadConfig(configDir);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ...cfg, geminiApiKey: maskKey(cfg.geminiApiKey) }));
        } catch (e) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
        return;
      }

      if (url.pathname === "/mascot.png") {
        const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/mascot/deskcat.png");
        res.writeHead(200, { "content-type": "image/png" });
        res.end(await readFile(file));
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
        res.writeHead(200, {
          "content-type": MIME[path.extname(full).toLowerCase()] ?? "application/octet-stream",
        });
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
