import assert from "node:assert/strict";
import test from "node:test";

import { runDryRun } from "../dry-run.mjs";
import { assertImportablePlan, importMigrationPlan, migrationImportTableOrder } from "../import-plan.mjs";
import { canonicalJson, sha256Hex } from "../support.mjs";

const manifestPath = new URL("./fixtures/manifest.json", import.meta.url).pathname;

class FakeClient {
  constructor(failInsert = false) {
    this.queries = [];
    this.failInsert = failInsert;
  }

  async query(sql, values = []) {
    this.queries.push({ sql, values });
    if (sql.includes("AS actor_authorized")) {
      return { rows: [{ actor_authorized: true, location_count: "1" }], rowCount: 1 };
    }
    if (sql.startsWith("WITH inserted AS")) {
      if (this.failInsert) {
        this.failInsert = false;
        return { rows: [], rowCount: 0 };
      }
      return { rows: [{ accepted: 1 }], rowCount: 1 };
    }
    return { rows: [], rowCount: null };
  }
}

test("staging importer uses ordered strict inserts and commits", async () => {
  const plan = await runDryRun(manifestPath);
  const client = new FakeClient();
  const result = await importMigrationPlan(client, plan);

  assert.equal(result.plan_id, plan.plan_id);
  assert.deepEqual(Object.keys(result.imported_or_verified), migrationImportTableOrder);
  assert.equal(client.queries[0].sql, "BEGIN ISOLATION LEVEL SERIALIZABLE");
  assert.equal(client.queries.at(-1).sql, "COMMIT");
  const insertSql = client.queries.filter((entry) => entry.sql.startsWith("WITH inserted AS")).map((entry) => entry.sql);
  assert.ok(insertSql.every((sql) => sql.includes("IS NOT DISTINCT FROM")));
  assert.ok(insertSql.every((sql) => !sql.includes("DO UPDATE")));
});

test("staging importer rolls back when an existing row differs", async () => {
  const plan = await runDryRun(manifestPath);
  const client = new FakeClient(true);

  await assert.rejects(() => importMigrationPlan(client, plan), /conflicts with the reviewed migration plan/u);
  assert.equal(client.queries.at(-1).sql, "ROLLBACK");
});

test("staging importer rejects tampering and unauthorized collections", async () => {
  const plan = await runDryRun(manifestPath);
  const tampered = structuredClone(plan);
  tampered.records.products[0].name = "Changed after review";
  assert.throws(() => assertImportablePlan(tampered), /checksum/u);

  const withUsers = structuredClone(plan);
  withUsers.records.users = [];
  const { plan_id: oldPlanId, ...withUsersContent } = withUsers;
  void oldPlanId;
  withUsers.plan_id = sha256Hex(canonicalJson(withUsersContent));
  assert.throws(() => assertImportablePlan(withUsers), /unauthorized record collection/u);
});
