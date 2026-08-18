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

describeWithPostgres("M4-001: Cash Ledger Schema", () => {
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
      try {
        await adminClient.query(`DROP DATABASE IF EXISTS ${quoteGeneratedDatabaseName(childDatabaseName)}`);
      } catch {
        // cleanup failure ok in tests
      }
      await adminClient.end();
    }
  });

  const expectTableToExist = async (/** @type {string} */ schema, /** @type {string} */ name, exists = true) => {
    const res = await client?.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename = $2`,
      [schema, name]
    );
    expect(res?.rows.length === 1).toBe(exists);
  };

  it("core.terminals exists", async () => {
    await expectTableToExist("core", "terminals");
  });

  it("cash.shifts exists", async () => {
    await expectTableToExist("cash", "shifts");
  });

  it("cash.cash_movements exists", async () => {
    await expectTableToExist("cash", "cash_movements");
  });

  it("cash.shift_closing_snapshots exists", async () => {
    await expectTableToExist("cash", "shift_closing_snapshots");
  });

  it("cash.shift_reconciliations exists", async () => {
    await expectTableToExist("cash", "shift_reconciliations");
  });

  it("prevents multiple OPEN shifts per terminal", async () => {
    if (!client) throw new Error("No client");

    const businessId = randomUUID();
    const locationId = randomUUID();
    const terminalId = randomUUID();
    const userId = randomUUID();

    await client.query("INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Test Biz', 'IDR', 'Asia/Jakarta', 'ACTIVE')", [businessId]);
    await client.query("INSERT INTO core.locations (id, business_id, code, name, type, is_default, status) VALUES ($1, $2, 'LOC1', 'Store', 'STORE', true, 'ACTIVE')", [locationId, businessId]);
    await client.query("INSERT INTO core.terminals (id, business_id, location_id, code, name, status) VALUES ($1, $2, $3, 'TERM1', 'Register 1', 'ACTIVE')", [terminalId, businessId, locationId]);
    await client.query("INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Cashier', 'ACTIVE')", [userId]);

    const shift1Id = randomUUID();
    await client.query(`
      INSERT INTO cash.shifts (id, business_id, location_id, terminal_id, cashier_user_id, shift_number, status, opening_cash, opened_at, review_status)
      VALUES ($1, $2, $3, $4, $5, 'S1', 'OPEN', 500000, NOW(), 'UNREVIEWED')
    `, [shift1Id, businessId, locationId, terminalId, userId]);

    const shift2Id = randomUUID();
    await expect(client.query(`
      INSERT INTO cash.shifts (id, business_id, location_id, terminal_id, cashier_user_id, shift_number, status, opening_cash, opened_at, review_status)
      VALUES ($1, $2, $3, $4, $5, 'S2', 'OPEN', 500000, NOW(), 'UNREVIEWED')
    `, [shift2Id, businessId, locationId, terminalId, userId])).rejects.toThrow(/duplicate key value violates unique constraint "shifts_active_terminal_idx"/);
  });
  
  it("allows multiple CLOSED shifts per terminal", async () => {
    if (!client) throw new Error("No client");
    
    const businessId = randomUUID();
    const locationId = randomUUID();
    const terminalId = randomUUID();
    const userId = randomUUID();

    await client.query("INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Test Biz', 'IDR', 'Asia/Jakarta', 'ACTIVE')", [businessId]);
    await client.query("INSERT INTO core.locations (id, business_id, code, name, type, is_default, status) VALUES ($1, $2, 'LOC2', 'Store 2', 'STORE', false, 'ACTIVE')", [locationId, businessId]);
    await client.query("INSERT INTO core.terminals (id, business_id, location_id, code, name, status) VALUES ($1, $2, $3, 'TERM2', 'Register 2', 'ACTIVE')", [terminalId, businessId, locationId]);
    await client.query("INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Cashier2', 'ACTIVE')", [userId]);

    const shift1Id = randomUUID();
    await client.query(`
      INSERT INTO cash.shifts (id, business_id, location_id, terminal_id, cashier_user_id, shift_number, status, opening_cash, opened_at, closed_at, review_status)
      VALUES ($1, $2, $3, $4, $5, 'S3', 'CLOSED', 500000, NOW(), NOW(), 'UNREVIEWED')
    `, [shift1Id, businessId, locationId, terminalId, userId]);

    const shift2Id = randomUUID();
    await client.query(`
      INSERT INTO cash.shifts (id, business_id, location_id, terminal_id, cashier_user_id, shift_number, status, opening_cash, opened_at, closed_at, review_status)
      VALUES ($1, $2, $3, $4, $5, 'S4', 'CLOSED', 500000, NOW(), NOW(), 'UNREVIEWED')
    `, [shift2Id, businessId, locationId, terminalId, userId]);
    
    expect(true).toBe(true);
  });
});
