#!/usr/bin/env node
// @ts-check

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import pg from "pg";

import { importMigrationPlan } from "./import-plan.mjs";
import { canonicalJson } from "./support.mjs";

async function main() {
  const { values } = parseArgs({
    options: {
      plan: { type: "string" },
      environment: { type: "string" },
      "confirm-plan-id": { type: "string" },
    },
    strict: true,
  });
  if (values.plan === undefined || values.environment === undefined || values["confirm-plan-id"] === undefined) {
    throw new Error("Usage: npm run migration:staging-import -- --plan <plan.json> --environment staging --confirm-plan-id <sha256>");
  }
  if (values.environment !== "staging" || process.env.KASTUR_TARGET_ENVIRONMENT !== "staging") {
    throw new Error("Staging import requires both --environment staging and KASTUR_TARGET_ENVIRONMENT=staging.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) throw new Error("DATABASE_URL is required.");
  const plan = JSON.parse(await readFile(values.plan, "utf8"));
  if (plan.plan_id !== values["confirm-plan-id"]) throw new Error("--confirm-plan-id does not match the plan artifact.");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await importMigrationPlan(client, plan);
    process.stdout.write(canonicalJson(result));
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
