#!/usr/bin/env node
// @ts-check

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { loadMigrationManifest } from "./manifest.mjs";
import { readConfiguredSource } from "./readers.mjs";
import { canonicalJson } from "./support.mjs";
import { buildMigrationPlan } from "./transform.mjs";

export async function runDryRun(manifestPath) {
  const loaded = await loadMigrationManifest(manifestPath);
  const sources = await Promise.all(
    loaded.manifest.sources.map((source) => readConfiguredSource(source, loaded.directory)),
  );
  return buildMigrationPlan(loaded.manifest, sources);
}

async function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: "string" },
      output: { type: "string", short: "o" },
    },
    strict: true,
  });
  if (values.manifest === undefined) throw new Error("Usage: npm run migration:dry-run -- --manifest <manifest.json> [--output plan.json]");
  const plan = await runDryRun(values.manifest);
  const rendered = canonicalJson(plan);
  if (values.output === undefined) process.stdout.write(rendered);
  else await writeFile(values.output, rendered, { encoding: "utf8", mode: 0o600 });
  if (plan.reconciliation_expected.issue_counts.error > 0 || plan.reconciliation_expected.issue_counts.review > 0) {
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
