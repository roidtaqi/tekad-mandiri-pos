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

function requireChildDatabaseUrl() {
  if (childDatabaseUrl === undefined) {
    throw new Error("childDatabaseUrl is not initialized.");
  }
  return childDatabaseUrl;
}

describeWithPostgres("M1-001: Core Business and Location Schema", () => {
  beforeAll(async () => {
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();

    const databaseName = `kastur_migration_test_${randomUUID().replaceAll("-", "")}`;
    await adminClient.query(`CREATE DATABASE ${quoteGeneratedDatabaseName(databaseName)}`);
    adminUrl.pathname = `/${databaseName}`;

    childDatabaseName = databaseName;
    childDatabaseUrl = adminUrl.toString();

    // A. Migration applies successfully to a clean PostgreSQL database.
    const url = requireChildDatabaseUrl();
    const applied = await applyMigrations({ databaseUrl: url });
    expect(applied.length).toBeGreaterThan(0);
    expect(applied.map(a => a.filename)).toContain("000001_create_core_businesses_locations.sql");

    client = new Client({ connectionString: url });
    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
    if (childDatabaseName !== undefined) {
      await adminClient?.query(`DROP DATABASE IF EXISTS ${quoteGeneratedDatabaseName(childDatabaseName)} WITH (FORCE)`);
    }
    if (adminClient) {
      await adminClient.end();
    }
  });

  it("B. creates the core schema", async () => {
    const result = await client?.query(`
      SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'core'
    `);
    expect(result?.rows.length).toBe(1);
  });

  it("C. creates the core.businesses table", async () => {
    const result = await client?.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'core' AND table_name = 'businesses'
    `);
    expect(result?.rows.length).toBe(1);
  });

  it("D. creates the core.locations table", async () => {
    const result = await client?.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'core' AND table_name = 'locations'
    `);
    expect(result?.rows.length).toBe(1);
  });

  it("E. creates tables with expected columns and types", async () => {
    const bResult = await client?.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_schema = 'core' AND table_name = 'businesses'
    `);
    const bCols = bResult?.rows.reduce((acc, r) => {
      acc[r.column_name] = { type: r.data_type, maxLength: r.character_maximum_length };
      return acc;
    }, {});
    
    expect(bCols).toMatchObject({
      id: { type: 'uuid' },
      name: { type: 'text' },
      currency_code: { type: 'character', maxLength: 3 },
      timezone: { type: 'text' },
      status: { type: 'text' },
      created_at: { type: 'timestamp with time zone' },
      updated_at: { type: 'timestamp with time zone' },
      version: { type: 'bigint' }
    });

    const lResult = await client?.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'core' AND table_name = 'locations'
    `);
    const lCols = lResult?.rows.reduce((acc, r) => {
      acc[r.column_name] = r.data_type;
      return acc;
    }, {});

    expect(lCols).toMatchObject({
      id: 'uuid',
      business_id: 'uuid',
      code: 'text',
      name: 'text',
      type: 'text',
      is_default: 'boolean',
      status: 'text',
      created_at: 'timestamp with time zone',
      updated_at: 'timestamp with time zone',
      version: 'bigint'
    });
  });

  it("F. inserts a Business with valid values", async () => {
    const id = randomUUID();
    const result = await client?.query(`
      INSERT INTO core.businesses (id, name, timezone, status)
      VALUES ($1, 'Test Business', 'Asia/Makassar', 'ACTIVE')
      RETURNING *
    `, [id]);
    expect(result?.rows[0].id).toBe(id);
    expect(result?.rows[0].currency_code).toBe('IDR');
    expect(result?.rows[0].version).toBe('1'); 
  });

  it("G. rejects invalid Business status", async () => {
    const id = randomUUID();
    await expect(
      client?.query(`
        INSERT INTO core.businesses (id, name, timezone, status)
        VALUES ($1, 'Test Business', 'Asia/Makassar', 'INVALID')
      `, [id])
    ).rejects.toThrow(/businesses_status_check/);
  });

  it("H. Location can reference an existing Business", async () => {
    const bId = randomUUID();
    await client?.query(`
      INSERT INTO core.businesses (id, name, timezone, status)
      VALUES ($1, 'B1', 'Asia/Makassar', 'ACTIVE')
    `, [bId]);

    const lId = randomUUID();
    const result = await client?.query(`
      INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
      VALUES ($1, $2, 'HQ', 'Headquarters', 'STORE', true, 'ACTIVE')
      RETURNING *
    `, [lId, bId]);
    expect(result?.rows[0].id).toBe(lId);
  });

  it("I. rejects Location referencing a nonexistent Business", async () => {
    const lId = randomUUID();
    const bId = randomUUID();
    await expect(
      client?.query(`
        INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
        VALUES ($1, $2, 'L1', 'L1', 'STORE', true, 'ACTIVE')
      `, [lId, bId])
    ).rejects.toThrow(/locations_business_id_fkey/);
  });

  it("J. rejects duplicate (business_id, code)", async () => {
    const bId = randomUUID();
    await client?.query(`
      INSERT INTO core.businesses (id, name, timezone, status)
      VALUES ($1, 'B2', 'Asia/Makassar', 'ACTIVE')
    `, [bId]);

    await client?.query(`
      INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
      VALUES ($1, $2, 'LOC1', 'LOC1', 'STORE', false, 'ACTIVE')
    `, [randomUUID(), bId]);

    await expect(
      client?.query(`
        INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
        VALUES ($1, $2, 'LOC1', 'LOC1 dup', 'STORE', false, 'ACTIVE')
      `, [randomUUID(), bId])
    ).rejects.toThrow(/locations_business_id_code_key/);
  });

  it("K. allows same location code in two different businesses", async () => {
    const b1 = randomUUID();
    const b2 = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'B3', 'UTC', 'ACTIVE')`, [b1]);
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'B4', 'UTC', 'ACTIVE')`, [b2]);

    await client?.query(`
      INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
      VALUES ($1, $2, 'SHARED_CODE', 'L1', 'STORE', false, 'ACTIVE')
    `, [randomUUID(), b1]);

    await expect(
      client?.query(`
        INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
        VALUES ($1, $2, 'SHARED_CODE', 'L2', 'STORE', false, 'ACTIVE')
      `, [randomUUID(), b2])
    ).resolves.not.toThrow();
  });

  it("L. rejects more than one is_default=true location per Business", async () => {
    const bId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'B5', 'UTC', 'ACTIVE')`, [bId]);

    await client?.query(`
      INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
      VALUES ($1, $2, 'DEF1', 'DEF1', 'STORE', true, 'ACTIVE')
    `, [randomUUID(), bId]);

    await expect(
      client?.query(`
        INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
        VALUES ($1, $2, 'DEF2', 'DEF2', 'STORE', true, 'ACTIVE')
      `, [randomUUID(), bId])
    ).rejects.toThrow(/locations_default_idx/);
  });

  it("M. different businesses can have their own default Location", async () => {
    const b1 = randomUUID();
    const b2 = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'B6', 'UTC', 'ACTIVE')`, [b1]);
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'B7', 'UTC', 'ACTIVE')`, [b2]);

    await client?.query(`
      INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
      VALUES ($1, $2, 'DEF', 'DEF', 'STORE', true, 'ACTIVE')
    `, [randomUUID(), b1]);

    await expect(
      client?.query(`
        INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
        VALUES ($1, $2, 'DEF', 'DEF', 'STORE', true, 'ACTIVE')
      `, [randomUUID(), b2])
    ).resolves.not.toThrow();
  });

  it("N. rejects invalid Location type", async () => {
    const bId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'B8', 'UTC', 'ACTIVE')`, [bId]);

    await expect(
      client?.query(`
        INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
        VALUES ($1, $2, 'L1', 'L1', 'INVALID', false, 'ACTIVE')
      `, [randomUUID(), bId])
    ).rejects.toThrow(/locations_type_check/);
  });

  it("O. rejects invalid Location status", async () => {
    const bId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'B9', 'UTC', 'ACTIVE')`, [bId]);

    await expect(
      client?.query(`
        INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
        VALUES ($1, $2, 'L1', 'L1', 'STORE', false, 'INVALID')
      `, [randomUUID(), bId])
    ).rejects.toThrow(/locations_status_check/);
  });

  it("P. rejects deleting Business with Locations (no cascade)", async () => {
    const bId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'B10', 'UTC', 'ACTIVE')`, [bId]);

    await client?.query(`
      INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
      VALUES ($1, $2, 'L1', 'L1', 'STORE', false, 'ACTIVE')
    `, [randomUUID(), bId]);

    await expect(
      client?.query(`DELETE FROM core.businesses WHERE id = $1`, [bId])
    ).rejects.toThrow(/locations_business_id_fkey/);
  });

  it("Q. migration status/history is valid", async () => {
    const result = await client?.query(`SELECT filename FROM public.kastur_schema_migrations ORDER BY version`);
    expect(result?.rows.map(r => r.filename)).toContain("000001_create_core_businesses_locations.sql");
  });

  it("R. re-running migrate is safe", async () => {
    const url = requireChildDatabaseUrl();
    const applied = await applyMigrations({ databaseUrl: url });
    expect(applied).toEqual([]);
  });
});
