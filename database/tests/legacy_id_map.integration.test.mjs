// @ts-check

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../scripts/migrations.mjs";

const configuredAdminUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = configuredAdminUrl === undefined ? describe.skip : describe;

/** @type {Client | undefined} */
let adminClient;
/** @type {string | undefined} */
let childDatabaseName;
/** @type {string | undefined} */
let childDatabaseUrl;
/** @type {Client | undefined} */
let client;

function requireSafeAdminUrl() {
  if (configuredAdminUrl === undefined || configuredAdminUrl.length === 0) {
    throw new Error("TEST_DATABASE_URL is required for database integration tests.");
  }
  return new URL(configuredAdminUrl);
}

/** @param {string} databaseName */
function quoteGeneratedDatabaseName(databaseName) {
  if (!/^kastur_migration_test_[0-9a-f]{32}$/u.test(databaseName)) {
    throw new Error(`Refusing unsafe generated database name: ${databaseName}`);
  }
  return `"${databaseName}"`;
}

describeWithPostgres("M12: Legacy ID Map", () => {
  beforeAll(async () => {
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();

    const databaseName = `kastur_migration_test_${randomUUID().replaceAll("-", "")}`;
    await adminClient.query(`CREATE DATABASE ${quoteGeneratedDatabaseName(databaseName)}`);
    childDatabaseName = databaseName;

    const childUrl = requireSafeAdminUrl();
    childUrl.pathname = `/${databaseName}`;
    childDatabaseUrl = childUrl.toString();

    const output = /** @type {string[]} */ ([]);
    const pushOutput = (/** @type {string} */ line) => output.push(line);
    const result = await applyMigrations({
      databaseUrl: childDatabaseUrl,
      silent: true,
      writeStdout: pushOutput,
      writeStderr: pushOutput,
    });
    // @ts-ignore
    if (!result.success && !Array.isArray(result)) {
      throw new Error(`Migration failed: \n${output.join("\n")}`);
    }

    client = new Client({ connectionString: childDatabaseUrl });
    await client.connect();
  });

  afterAll(async () => {
    if (client !== undefined) {
      await client.end();
    }
    if (adminClient !== undefined) {
      if (childDatabaseName !== undefined) {
        await adminClient.query(`DROP DATABASE ${quoteGeneratedDatabaseName(childDatabaseName)} WITH (FORCE)`);
      }
      await adminClient.end();
    }
  });

  const businessId = randomUUID();

  beforeAll(async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    await client.query(`
      INSERT INTO core.businesses (id, name, status, created_at, updated_at)
      VALUES ($1, 'Test Business', 'ACTIVE', NOW(), NOW())
    `, [businessId]);
  });

  it("can insert and map legacy ids", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    const id = randomUUID();
    const newEntityId = randomUUID();

    const res = await client.query(`
      INSERT INTO core.legacy_id_map (
        id, business_id, source_system, entity_type, legacy_id, new_entity_id, migrated_at
      )
      VALUES (
        $1, $2, 'LEGACY_POS', 'PRODUCT', 'PROD-001', $3, NOW()
      )
      RETURNING *
    `, [id, businessId, newEntityId]);

    expect(res.rowCount).toBe(1);
    expect(res.rows[0].legacy_id).toBe('PROD-001');
  });
});
