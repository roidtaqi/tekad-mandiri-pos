// @ts-check

import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";

const apiEntryPath = resolve(process.cwd(), "apps/api/dist/index.js");

async function loadHandler() {
  try {
    const mod = await import(pathToFileURL(apiEntryPath).href);
    if (typeof mod.handleRequest === "function") {
      return mod.handleRequest;
    }
    if (typeof mod.default?.fetch === "function") {
      return mod.default.fetch;
    }
    throw new Error("Could not find handleRequest or default.fetch in apps/api/dist/index.js");
  } catch (error) {
    process.stderr.write(
      `Failed to load API bundle at ${apiEntryPath}. Make sure to build first (npm run build --workspace @kastur/api).\nError: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    throw error;
  }
}

async function main() {
  const handler = await loadHandler();

  const server = createServer(async (req, res) => {
    try {
      const protocol = req.headers["x-forwarded-proto"] || "http";
      const authority = req.headers.host || `localhost:${port}`;
      const url = new URL(req.url || "/", `${protocol}://${authority}`);

      /** @type {HeadersInit} */
      const headers = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) {
          headers[key] = Array.isArray(value) ? value.join(", ") : value;
        }
      }

      /** @type {BodyInit | null} */
      let body = null;
      if (req.method !== "GET" && req.method !== "HEAD") {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }

      const webRequest = new Request(url.toString(), {
        body,
        // @ts-ignore
        duplex: "half",
        headers,
        method: req.method,
      });

      const env = {
        DATABASE_URL: process.env.DATABASE_URL,
        OFFLINE_AUTH_SIGNING_KEY_ID: process.env.OFFLINE_AUTH_SIGNING_KEY_ID,
        OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK:
          process.env.OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK,
      };

      const webResponse = await handler(webRequest, env);

      res.statusCode = webResponse.status;
      for (const [key, value] of webResponse.headers.entries()) {
        res.setHeader(key, value);
      }

      if (webResponse.body) {
        const reader = webResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      }
      res.end();
    } catch (error) {
      process.stderr.write(
        `[api-server] Internal request error: ${error instanceof Error ? error.stack : String(error)}\n`,
      );
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Terjadi kesalahan internal pada server.",
            },
          }),
        );
      }
    }
  });

  server.listen(port, host, () => {
    process.stdout.write(
      `🚀 Kastur API Server listening on http://${host}:${port}\n` +
        `   Health check: http://${host}:${port}/health\n` +
        `   Database: ${process.env.DATABASE_URL ? "Configured" : "⚠️ NOT CONFIGURED"}\n`,
    );
  });

  function shutdown(signal) {
    process.stdout.write(`\nReceived ${signal}, shutting down gracefully...\n`);
    server.close(() => {
      process.stdout.write("API server closed.\n");
      process.exit(0);
    });
    setTimeout(() => {
      process.stderr.write("Forced exit after timeout.\n");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  process.stderr.write(`Fatal API server startup error: ${error}\n`);
  process.exit(1);
});
