// @ts-check

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const targetDirArg = process.argv[2] || "dist";
const distDir = resolve(process.cwd(), targetDirArg);

function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function sendFile(filePath, req, res) {
  const stat = statSync(filePath);
  const mimeType = getMimeType(filePath);

  res.statusCode = 200;
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", stat.size);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  if (filePath.includes("/assets/")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else if (mimeType.startsWith("text/html")) {
    res.setHeader("Cache-Control", "no-cache");
  } else {
    res.setHeader("Cache-Control", "public, max-age=3600");
  }

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
}

function main() {
  if (!existsSync(distDir)) {
    process.stderr.write(
      `Error: Directory ${distDir} does not exist. Run 'npm run build' first.\n`,
    );
    process.exit(1);
  }

  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(url.pathname);

      // Healthcheck endpoint
      if (pathname === "/health") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      // Security check: avoid directory traversal
      const safePath = join(distDir, pathname.replace(/^\/+/u, ""));
      if (!safePath.startsWith(distDir)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }

      if (existsSync(safePath) && statSync(safePath).isFile()) {
        sendFile(safePath, req, res);
        return;
      }

      // Fallback for directory index
      const indexPath = join(safePath, "index.html");
      if (existsSync(indexPath) && statSync(indexPath).isFile()) {
        sendFile(indexPath, req, res);
        return;
      }

      // SPA fallback: return root index.html
      const rootIndex = join(distDir, "index.html");
      if (existsSync(rootIndex) && statSync(rootIndex).isFile()) {
        sendFile(rootIndex, req, res);
        return;
      }

      res.statusCode = 404;
      res.end("Not Found");
    } catch (error) {
      process.stderr.write(`Error serving request: ${error}\n`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }
  });

  server.listen(port, host, () => {
    process.stdout.write(
      `🚀 SPA static server serving ${distDir} on http://${host}:${port}\n` +
        `   Healthcheck: http://${host}:${port}/health\n`,
    );
  });

  function shutdown(signal) {
    process.stdout.write(`\nReceived ${signal}, shutting down SPA server...\n`);
    server.close(() => {
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
