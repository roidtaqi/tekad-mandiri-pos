// @ts-check

import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultPort = Number(process.env.PORT || 8787);
const defaultHost = process.env.HOST || "0.0.0.0";

export const defaultApiEntryPath = resolve(process.cwd(), "apps/api/dist/index.js");

/**
 * @param {string} [entryPath]
 */
export async function loadHandler(entryPath = defaultApiEntryPath) {
  try {
    const mod = await import(pathToFileURL(entryPath).href);
    if (typeof mod.handleRequest === "function") {
      return mod.handleRequest;
    }
    if (typeof mod.default?.fetch === "function") {
      return mod.default.fetch;
    }
    throw new Error("Could not find handleRequest or default.fetch in apps/api/dist/index.js");
  } catch (error) {
    process.stderr.write(
      `Failed to load API bundle at ${entryPath}. Make sure to build first (npm run build --workspace @kastur/api).\nError: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    throw error;
  }
}

/**
 * Builds the canonical ApiEnvironment object from process.env or custom overrides.
 * @param {Record<string, string | undefined>} [sourceEnv]
 */
export function buildApiEnvironment(sourceEnv = process.env) {
  return {
    ALLOWED_ORIGINS: sourceEnv.ALLOWED_ORIGINS,
    DATABASE_URL: sourceEnv.DATABASE_URL,
    KASTUR_SETUP_TOKEN: sourceEnv.KASTUR_SETUP_TOKEN,
    NODE_ENV: sourceEnv.NODE_ENV,
    OFFLINE_AUTH_SIGNING_KEY_ID: sourceEnv.OFFLINE_AUTH_SIGNING_KEY_ID,
    OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK:
      sourceEnv.OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK,
  };
}

/**
 * Creates a Node.js HTTP server instance backed by the Web Standard Request handler.
 * @param {(request: Request, env: any, deps?: any) => Promise<Response>} handler
 * @param {Record<string, string | undefined>} [environment]
 * @param {any} [dependencies]
 */
export function createNodeHttpServer(handler, environment = process.env, dependencies = {}) {
  const env = buildApiEnvironment(environment);

  return createServer(async (req, res) => {
    try {
      const protocol = req.headers["x-forwarded-proto"] || "http";
      const port = environment.PORT || 8787;
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

      const webResponse = await handler(webRequest, env, dependencies);

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
}

async function main() {
  const handler = await loadHandler();
  const server = createNodeHttpServer(handler, process.env);

  const port = defaultPort;
  const host = defaultHost;

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Fatal API server startup error: ${error}\n`);
    process.exit(1);
  });
}
