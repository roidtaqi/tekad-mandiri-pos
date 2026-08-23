#!/usr/bin/env node
// @ts-check

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import pg from "pg";

import { assertImportablePlan } from "./import-plan.mjs";
import { collectStagingReadiness, parseStagingEvidence } from "./readiness.mjs";
import { canonicalJson, UUID_PATTERN } from "./support.mjs";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const { values } = parseArgs({
    options: {
      "business-id": { type: "string" },
      environment: { type: "string" },
      "expected-plan": { type: "string" },
      evidence: { type: "string" },
      output: { type: "string", short: "o" },
    },
    strict: true,
  });
  if (values["business-id"] === undefined || values.environment === undefined) {
    throw new Error("Usage: npm run staging:readiness -- --business-id <uuid> --environment staging [--expected-plan plan.json] [--evidence evidence.json] [-o report.json]");
  }
  if (!UUID_PATTERN.test(values["business-id"])) throw new Error("--business-id must be a UUID.");
  if (values.environment !== "staging" || process.env.KASTUR_TARGET_ENVIRONMENT !== "staging") {
    throw new Error("Staging readiness requires both --environment staging and KASTUR_TARGET_ENVIRONMENT=staging.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) throw new Error("DATABASE_URL is required.");
  const expectedPlan = values["expected-plan"] === undefined ? null : assertImportablePlan(await readJson(values["expected-plan"]));
  if (expectedPlan !== null && expectedPlan.business_id !== values["business-id"]) throw new Error("Expected plan targets a different business.");
  const evidence = values.evidence === undefined ? null : parseStagingEvidence(await readJson(values.evidence));
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const report = await collectStagingReadiness(client, values["business-id"], expectedPlan, evidence);
    await client.query("COMMIT");
    const rendered = canonicalJson(report);
    if (values.output === undefined) process.stdout.write(rendered);
    else await writeFile(values.output, rendered, { encoding: "utf8", mode: 0o600 });
    if (report.assessment.status !== "READY_FOR_PILOT_REVIEW") process.exitCode = 2;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the readiness error.
    }
    throw error;
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
