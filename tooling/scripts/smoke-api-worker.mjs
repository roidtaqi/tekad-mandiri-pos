import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 20_000;
const STOP_TIMEOUT_MS = 5_000;

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const apiRoot = path.join(repositoryRoot, "apps/api");

function hasExited(childProcess) {
  return childProcess.exitCode !== null || childProcess.signalCode !== null;
}

function waitForExit(childProcess) {
  if (hasExited(childProcess)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    childProcess.once("exit", resolve);
  });
}

function delay(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function reserveLocalPort() {
  const server = createServer();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, LOCAL_HOST, resolve);
  });

  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const port = address.port;

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });

  return port;
}

async function resolveWranglerEntrypoint() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("wrangler/package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const entrypoint =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.wrangler;

  if (typeof entrypoint !== "string") {
    throw new Error("The installed Wrangler package has no Wrangler CLI entrypoint.");
  }

  return path.resolve(path.dirname(manifestPath), entrypoint);
}

function appendOutput(currentOutput, chunk) {
  return `${currentOutput}${chunk}`.slice(-20_000);
}

async function waitForWorker(url, childProcess, getOutput, getSpawnError) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const spawnError = getSpawnError();

    if (spawnError !== undefined) {
      throw spawnError;
    }

    if (hasExited(childProcess)) {
      throw new Error(
        `Wrangler exited before the local Worker was ready.\n${getOutput()}`,
      );
    }

    try {
      return await fetch(url, { signal: AbortSignal.timeout(1_000) });
    } catch {
      await delay(100);
    }
  }

  throw new Error(
    `Timed out waiting for the local Worker to start.\n${getOutput()}`,
  );
}

async function stopWrangler(childProcess) {
  if (hasExited(childProcess)) {
    return;
  }

  childProcess.kill("SIGTERM");

  const stoppedCleanly = await Promise.race([
    waitForExit(childProcess).then(() => true),
    delay(STOP_TIMEOUT_MS).then(() => false),
  ]);

  if (stoppedCleanly) {
    return;
  }

  childProcess.kill("SIGKILL");
  await waitForExit(childProcess);
  throw new Error("Wrangler did not stop within the graceful shutdown timeout.");
}

const port = await reserveLocalPort();
const wranglerEntrypoint = await resolveWranglerEntrypoint();
const baseUrl = `http://${LOCAL_HOST}:${port}`;
const childEnvironment = {
  ...process.env,
  CI: "true",
  CLOUDFLARE_CF_FETCH_ENABLED: "false",
  WRANGLER_SEND_METRICS: "false",
};
const wrangler = spawn(
  process.execPath,
  [
    wranglerEntrypoint,
    "dev",
    "--local",
    "--config",
    "wrangler.jsonc",
    "--ip",
    LOCAL_HOST,
    "--port",
    String(port),
    "--show-interactive-dev-session=false",
  ],
  {
    cwd: apiRoot,
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
let spawnError;

wrangler.stdout.on("data", (chunk) => {
  output = appendOutput(output, chunk);
});
wrangler.stderr.on("data", (chunk) => {
  output = appendOutput(output, chunk);
});
wrangler.once("error", (error) => {
  spawnError = error;
});

let smokeError;

try {
  const healthResponse = await waitForWorker(
    `${baseUrl}/api/v1/system/health`,
    wrangler,
    () => output,
    () => spawnError,
  );

  assert.equal(healthResponse.status, 200);
  assert.equal(
    healthResponse.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(healthResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await healthResponse.json(), { status: "ok" });

  const notFoundResponse = await fetch(`${baseUrl}/api/v1/unknown`, {
    signal: AbortSignal.timeout(2_000),
  });

  assert.equal(notFoundResponse.status, 404);
  assert.equal(
    notFoundResponse.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(notFoundResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await notFoundResponse.json(), {
    error: {
      code: "NOT_FOUND",
      message: "Endpoint tidak ditemukan.",
    },
  });
} catch (error) {
  smokeError = error;
}

try {
  await stopWrangler(wrangler);
} catch (error) {
  smokeError ??= error;
}

if (smokeError !== undefined) {
  throw smokeError;
}

console.log("Verified the Kastur API in the local Cloudflare Worker runtime.");
