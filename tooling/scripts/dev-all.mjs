// @ts-check

import { spawn } from "node:child_process";

/** @type {Array<import("node:child_process").ChildProcess>} */
const processes = [];

const commands = [
  { color: "\x1b[36m", name: "api", script: "npm run dev:api" },
  { color: "\x1b[32m", name: "pos", script: "npm run dev:pos" },
  { color: "\x1b[35m", name: "backoffice", script: "npm run dev:backoffice" },
];

function run() {
  process.stdout.write(
    "\x1b[1m\x1b[34m============================================================\n" +
      "  Kastur Retail System v2 — Local Development Environment\n" +
      "  API:         http://localhost:8787\n" +
      "  POS:         http://localhost:5173\n" +
      "  Back Office: http://localhost:5174\n" +
      "============================================================\x1b[0m\n\n",
  );

  for (const cmd of commands) {
    const child = spawn(cmd.script, {
      env: process.env,
      shell: true,
      stdio: ["inherit", "pipe", "pipe"],
    });

    processes.push(child);

    const prefix = `${cmd.color}[${cmd.name}]\x1b[0m `;

    child.stdout?.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim() !== "") {
          process.stdout.write(`${prefix}${line}\n`);
        }
      }
    });

    child.stderr?.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim() !== "") {
          process.stderr.write(`${prefix}${line}\n`);
        }
      }
    });

    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        process.stderr.write(`${prefix}Exited with code ${code}\n`);
      }
    });
  }

  function cleanup() {
    process.stdout.write("\nStopping all development processes...\n");
    for (const proc of processes) {
      proc.kill("SIGINT");
    }
    setTimeout(() => {
      for (const proc of processes) {
        proc.kill("SIGKILL");
      }
      process.exit(0);
    }, 2000).unref();
  }

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

run();
