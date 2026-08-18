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
    throw new Error(`Database name fails safety check: ${databaseName}`);
  }
  return `"${databaseName}"`;
}

describeWithPostgres("sync.idempotency_records schema", () => {
  beforeAll(async () => {
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.href });
    await adminClient.connect();

    const randomSuffix = randomUUID().replace(/-/g, "");
    childDatabaseName = `kastur_migration_test_${randomSuffix}`;

    await adminClient.query(`CREATE DATABASE ${quoteGeneratedDatabaseName(childDatabaseName)}`);

    const childUrl = new URL(adminUrl.href);
    childUrl.pathname = `/${childDatabaseName}`;
    childDatabaseUrl = childUrl.href;

    await applyMigrations({ databaseUrl: childDatabaseUrl });

    client = new Client({ connectionString: childDatabaseUrl });
    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
    if (adminClient && childDatabaseName) {
      // Disconnect others before dropping
      await adminClient.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [childDatabaseName]);
      await adminClient.query(`DROP DATABASE IF EXISTS ${quoteGeneratedDatabaseName(childDatabaseName)}`);
      await adminClient.end();
    }
  });

  it("M3-001: enforces unique business_id + command_type + idempotency_key", async () => {
    if (!client) throw new Error("Client not initialized");

    const businessId = randomUUID();
    await client.query("INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Test Biz', 'IDR', 'Asia/Jakarta', 'ACTIVE')", [businessId]);

    const idempotencyKey = "cmd-123";
    const commandType = "COMPLETE_SALE";
    const requestHash = "hash1";

    // 1. Initial insert succeeds
    await client.query(`
      INSERT INTO sync.idempotency_records
      (business_id, idempotency_key, command_type, request_hash, status)
      VALUES ($1, $2, $3, $4, 'PENDING')
    `, [businessId, idempotencyKey, commandType, requestHash]);

    // 2. Exact duplicate fails with unique constraint
    await expect(client.query(`
      INSERT INTO sync.idempotency_records
      (business_id, idempotency_key, command_type, request_hash, status)
      VALUES ($1, $2, $3, $4, 'PENDING')
    `, [businessId, idempotencyKey, commandType, requestHash])).rejects.toThrow(/duplicate key value violates unique constraint/);

    // 3. Different key succeeds
    await client.query(`
      INSERT INTO sync.idempotency_records
      (business_id, idempotency_key, command_type, request_hash, status)
      VALUES ($1, $2, $3, $4, 'PENDING')
    `, [businessId, "cmd-124", commandType, requestHash]);

    // 4. Same key different command type succeeds
    await client.query(`
      INSERT INTO sync.idempotency_records
      (business_id, idempotency_key, command_type, request_hash, status)
      VALUES ($1, $2, $3, $4, 'PENDING')
    `, [businessId, idempotencyKey, "OTHER_COMMAND", requestHash]);
  });

  it("M3-001: allows storing response payloads", async () => {
    if (!client) throw new Error("Client not initialized");

    const businessId = randomUUID();
    await client.query("INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Test Biz 2', 'IDR', 'Asia/Jakarta', 'ACTIVE')", [businessId]);

    const resultId = randomUUID();
    const payload = JSON.stringify({ transaction_id: resultId });

    await client.query(`
      INSERT INTO sync.idempotency_records
      (business_id, idempotency_key, command_type, request_hash, status, result_code, result_entity_type, result_entity_id, response_payload, completed_at)
      VALUES ($1, 'cmd-200', 'COMPLETE_SALE', 'hash2', 'COMPLETED', 'SUCCESS', 'TRANSACTION', $2, $3, now())
    `, [businessId, resultId, payload]);

    const res = await client.query("SELECT response_payload FROM sync.idempotency_records WHERE idempotency_key = 'cmd-200'");
    expect(res.rows[0].response_payload).toEqual({ transaction_id: resultId });
  });

  it("M3-002: change_feed allows appending and sequences increment", async () => {
    if (!client) throw new Error("Client not initialized");

    const businessId = randomUUID();
    await client.query("INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Test Biz 3', 'IDR', 'Asia/Jakarta', 'ACTIVE')", [businessId]);

    const entityId = randomUUID();
    const payload = JSON.stringify({ name: "Updated Item" });

    // 1. Insert change
    const res1 = await client.query(`
      INSERT INTO sync.change_feed
      (business_id, entity_type, entity_id, change_type, entity_version, payload, occurred_at)
      VALUES ($1, 'PRODUCT', $2, 'UPSERT', 1, $3, now())
      RETURNING sequence
    `, [businessId, entityId, payload]);
    const seq1 = res1.rows[0].sequence;

    // 2. Insert another change
    const res2 = await client.query(`
      INSERT INTO sync.change_feed
      (business_id, entity_type, entity_id, change_type, entity_version, payload, occurred_at)
      VALUES ($1, 'PRODUCT', $2, 'UPSERT', 2, $3, now())
      RETURNING sequence
    `, [businessId, entityId, payload]);
    const seq2 = res2.rows[0].sequence;

    expect(BigInt(seq2)).toBeGreaterThan(BigInt(seq1));
  });

  it("M3-003: device_sync_states tracks cursor properly", async () => {
    if (!client) throw new Error("Client not initialized");

    const businessId = randomUUID();
    await client.query("INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Test Biz 4', 'IDR', 'Asia/Jakarta', 'ACTIVE')", [businessId]);

    const deviceId = randomUUID();
    const locationId = randomUUID();
    await client.query("INSERT INTO core.locations (id, business_id, code, name, type, is_default, status) VALUES ($1, $2, 'LOC-01', 'Test Loc', 'STORE', true, 'ACTIVE')", [locationId, businessId]);
    await client.query("INSERT INTO identity.devices (id, business_id, device_key, name, status) VALUES ($1, $2, 'key-123', 'Test Device', 'ACTIVE')", [deviceId, businessId]);

    await client.query(`
      INSERT INTO sync.device_sync_states
      (business_id, device_id, last_ack_sequence, client_version, schema_version)
      VALUES ($1, $2, 0, '1.0', 1)
    `, [businessId, deviceId]);

    const res = await client.query("UPDATE sync.device_sync_states SET last_ack_sequence = 123, last_pull_at = now() WHERE business_id = $1 AND device_id = $2 RETURNING last_ack_sequence", [businessId, deviceId]);
    expect(res.rows[0].last_ack_sequence).toEqual("123");
  });

  it("M3-004: conflicts schema logs unresolvable conflicts", async () => {
    if (!client) throw new Error("Client not initialized");

    const businessId = randomUUID();
    await client.query("INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Test Biz 5', 'IDR', 'Asia/Jakarta', 'ACTIVE')", [businessId]);

    const entityId = randomUUID();
    const localVal = JSON.stringify({ a: 1 });
    const serverVal = JSON.stringify({ a: 2 });

    await client.query(`
      INSERT INTO sync.conflicts
      (business_id, conflict_type, entity_type, entity_id, local_version, server_version, local_value, server_value, status)
      VALUES ($1, 'VERSION_MISMATCH', 'PRODUCT', $2, 1, 2, $3, $4, 'UNRESOLVED')
    `, [businessId, entityId, localVal, serverVal]);
  });

});
