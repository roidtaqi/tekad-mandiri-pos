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

describeWithPostgres("M1-003: Auth / Session Contract Foundation", () => {
  beforeAll(async () => {
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();

    const databaseName = `kastur_migration_test_${randomUUID().replaceAll("-", "")}`;
    await adminClient.query(`CREATE DATABASE ${quoteGeneratedDatabaseName(databaseName)}`);
    adminUrl.pathname = `/${databaseName}`;

    childDatabaseName = databaseName;
    childDatabaseUrl = adminUrl.toString();

    const url = requireChildDatabaseUrl();
    const applied = await applyMigrations({ databaseUrl: url });
    expect(applied.length).toBeGreaterThan(0);
    
    client = new Client({ connectionString: url });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
    if (adminClient && childDatabaseName) {
      await adminClient.query(`DROP DATABASE IF EXISTS ${quoteGeneratedDatabaseName(childDatabaseName)}`);
      await adminClient.end();
    }
  });

  it("A. migration 000004 applies after 000001/000002/000003", async () => {
    const res = await client?.query(`SELECT filename FROM public.kastur_schema_migrations ORDER BY version ASC`);
    const filenames = res?.rows.map(r => r.filename) ?? [];
    expect(filenames).toContain("000004_create_identity_devices_sessions_authorization_versions.sql");
  });

  it("B. migration history contains all four files in order", async () => {
    const res = await client?.query(`SELECT filename FROM public.kastur_schema_migrations ORDER BY version ASC`);
    const filenames = res?.rows.map(r => r.filename) ?? [];
    const expectedPrefix = [
      "000001_create_core_businesses_locations.sql",
      "000002_create_identity_core_schema.sql",
      "000003_seed_permission_catalog_role_presets.sql",
      "000004_create_identity_devices_sessions_authorization_versions.sql",
      "000005_create_catalog_products_categories_brands.sql",
      "000006_create_product_units_barcodes.sql"
    ];
    expect(filenames.slice(0, expectedPrefix.length)).toEqual(expectedPrefix);
  });

  /**
   * @param {string} schema
   * @param {string} name
   * @param {boolean} exists
   */
  const expectTableToExist = async (schema, name, exists = true) => {
    const res = await client?.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [schema, name]
    );
    expect(res?.rows.length === 1).toBe(exists);
  };

  it("C. identity.devices exists", async () => {
    await expectTableToExist("identity", "devices");
  });

  it("D. identity.sessions exists", async () => {
    await expectTableToExist("identity", "sessions");
  });

  it("E. identity.authorization_versions exists", async () => {
    await expectTableToExist("identity", "authorization_versions");
  });

  it("F. identity.terminal_device_assignments does NOT exist", async () => {
    await expectTableToExist("identity", "terminal_device_assignments", false);
  });

  it("G. exact expected column types for all three new tables", async () => {
    const res1 = await client?.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'identity' AND table_name = 'devices'
    `);
    const devicesCols = Object.fromEntries(res1?.rows.map(r => [r.column_name, r.data_type]) ?? []);
    expect(devicesCols).toEqual({
      id: "uuid",
      business_id: "uuid",
      device_key: "text",
      name: "text",
      platform: "text",
      status: "text",
      first_seen_at: "timestamp with time zone",
      last_seen_at: "timestamp with time zone",
      revoked_at: "timestamp with time zone",
      created_at: "timestamp with time zone"
    });

    const res2 = await client?.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'identity' AND table_name = 'sessions'
    `);
    const sessionsCols = Object.fromEntries(res2?.rows.map(r => [r.column_name, r.data_type]) ?? []);
    expect(sessionsCols).toEqual({
      id: "uuid",
      user_id: "uuid",
      business_id: "uuid",
      device_id: "uuid",
      session_secret_hash: "text",
      issued_at: "timestamp with time zone",
      expires_at: "timestamp with time zone",
      revoked_at: "timestamp with time zone",
      last_seen_at: "timestamp with time zone"
    });

    const res3 = await client?.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'identity' AND table_name = 'authorization_versions'
    `);
    const authVersionsCols = Object.fromEntries(res3?.rows.map(r => [r.column_name, r.data_type]) ?? []);
    expect(authVersionsCols).toEqual({
      membership_id: "uuid",
      version: "bigint",
      changed_at: "timestamp with time zone"
    });
  });

  it("H, I, J. device accepts status, rejects invalid, requires business", async () => {
    const businessId = randomUUID();
    const deviceId1 = randomUUID();
    const deviceId2 = randomUUID();
    const deviceId3 = randomUUID();

    // J. Requires existing business
    await expect(client?.query(`
      INSERT INTO identity.devices (id, business_id, device_key, status)
      VALUES ($1, $2, 'k1', 'ACTIVE')
    `, [deviceId1, businessId])).rejects.toThrow();

    await client?.query(`
      INSERT INTO core.businesses (id, name, currency_code, timezone, status)
      VALUES ($1, 'Test', 'IDR', 'Asia/Jakarta', 'ACTIVE')
    `, [businessId]);

    // H. Valid statuses
    await client?.query(`
      INSERT INTO identity.devices (id, business_id, device_key, status)
      VALUES ($1, $2, 'k1', 'ACTIVE'),
             ($3, $2, 'k2', 'INACTIVE'),
             ($4, $2, 'k3', 'REVOKED')
    `, [deviceId1, businessId, deviceId2, deviceId3]);

    // I. Invalid status rejected
    await expect(client?.query(`
      INSERT INTO identity.devices (id, business_id, device_key, status)
      VALUES ($1, $2, 'k4', 'INVALID')
    `, [randomUUID(), businessId])).rejects.toThrow();
  });

  it("K. duplicate (business_id, device_key) is rejected", async () => {
    const businessId = randomUUID();
    await client?.query(`
      INSERT INTO core.businesses (id, name, currency_code, timezone, status)
      VALUES ($1, 'Test2', 'IDR', 'Asia/Jakarta', 'ACTIVE')
    `, [businessId]);
    await client?.query(`
      INSERT INTO identity.devices (id, business_id, device_key, status)
      VALUES ($1, $2, 'duplicate', 'ACTIVE')
    `, [randomUUID(), businessId]);
    
    await expect(client?.query(`
      INSERT INTO identity.devices (id, business_id, device_key, status)
      VALUES ($1, $2, 'duplicate', 'ACTIVE')
    `, [randomUUID(), businessId])).rejects.toThrow();
  });

  it("L. same device_key is allowed in two different Businesses", async () => {
    const b1 = randomUUID();
    const b2 = randomUUID();
    await client?.query(`
      INSERT INTO core.businesses (id, name, currency_code, timezone, status)
      VALUES ($1, 'B1', 'IDR', 'Asia/Jakarta', 'ACTIVE'), ($2, 'B2', 'IDR', 'Asia/Jakarta', 'ACTIVE')
    `, [b1, b2]);

    await client?.query(`
      INSERT INTO identity.devices (id, business_id, device_key, status)
      VALUES ($1, $2, 'shared_key', 'ACTIVE')
    `, [randomUUID(), b1]);

    await client?.query(`
      INSERT INTO identity.devices (id, business_id, device_key, status)
      VALUES ($1, $2, 'shared_key', 'ACTIVE')
    `, [randomUUID(), b2]);
  });

  it("M. device_id remains independent of User", async () => {
    const res = await client?.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'identity' AND table_name = 'devices' AND column_name = 'user_id'
    `);
    expect(res?.rows.length).toBe(0);
  });

  it("N, O, P, Q, R, S, T, U, V. Session constraints", async () => {
    const businessId = randomUUID();
    const userId = randomUUID();
    const deviceId = randomUUID();
    const sessionId = randomUUID();

    // Setup base entities
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Test', 'IDR', 'Asia/Jakarta', 'ACTIVE')`, [businessId]);
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test User', 'ACTIVE')`, [userId]);
    await client?.query(`INSERT INTO identity.devices (id, business_id, device_key, status) VALUES ($1, $2, 'k5', 'ACTIVE')`, [deviceId, businessId]);

    // O. requires existing business
    await expect(client?.query(`
      INSERT INTO identity.sessions (id, user_id, business_id, session_secret_hash, expires_at)
      VALUES ($1, $2, $3, 'missing-business-hash', CURRENT_TIMESTAMP + INTERVAL '1 hour')
    `, [randomUUID(), userId, randomUUID()])).rejects.toThrow();

    // N. requires existing user
    await expect(client?.query(`
      INSERT INTO identity.sessions (id, user_id, business_id, session_secret_hash, expires_at)
      VALUES ($1, $2, $3, 'missing-user-hash', CURRENT_TIMESTAMP + INTERVAL '1 hour')
    `, [randomUUID(), randomUUID(), businessId])).rejects.toThrow();

    // Q. non-null device_id requires existing device
    await expect(client?.query(`
      INSERT INTO identity.sessions (id, user_id, business_id, device_id, session_secret_hash, expires_at)
      VALUES ($1, $2, $3, $4, 'missing-device-hash', CURRENT_TIMESTAMP + INTERVAL '1 hour')
    `, [randomUUID(), userId, businessId, randomUUID()])).rejects.toThrow();

    // P. session may have device_id = NULL
    await client?.query(`
      INSERT INTO identity.sessions (id, user_id, business_id, session_secret_hash, expires_at)
      VALUES ($1, $2, $3, 'nullable-device-hash', CURRENT_TIMESTAMP + INTERVAL '1 hour')
    `, [randomUUID(), userId, businessId]);

    // V. historical revoked session row remains storable
    // R. contains session_secret_hash
    // U. revoked_at may be NULL
    await client?.query(`
      INSERT INTO identity.sessions (id, user_id, business_id, device_id, session_secret_hash, expires_at, revoked_at)
      VALUES ($1, $2, $3, $4, 'revoked-session-hash', CURRENT_TIMESTAMP + INTERVAL '1 hour', NOW())
    `, [sessionId, userId, businessId, deviceId]);

    // 000021: session secrets are opaque lookup keys and must be unique.
    await expect(client?.query(`
      INSERT INTO identity.sessions
        (id, user_id, business_id, session_secret_hash, expires_at)
      VALUES
        ($1, $2, $3, 'nullable-device-hash', CURRENT_TIMESTAMP + INTERVAL '2 hours')
    `, [randomUUID(), userId, businessId])).rejects.toThrow();

    // 000021: expiry must be strictly later than issuance.
    await expect(client?.query(`
      INSERT INTO identity.sessions
        (id, user_id, business_id, session_secret_hash, issued_at, expires_at)
      VALUES ($1, $2, $3, 'invalid-expiry-hash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [randomUUID(), userId, businessId])).rejects.toThrow();

    // T. expires_at is NOT NULL
    await expect(client?.query(`
      INSERT INTO identity.sessions (id, user_id, business_id, session_secret_hash)
      VALUES ($1, $2, $3, 'hash_no_expiry')
    `, [randomUUID(), userId, businessId])).rejects.toThrow();

    // S. session does not contain plaintext token/password
    const res = await client?.query(`
      SELECT column_name FROM information_schema.columns WHERE table_schema = 'identity' AND table_name = 'sessions'
    `);
    const cols = res?.rows.map(r => r.column_name) ?? [];
    expect(cols).toContain("session_secret_hash");
    expect(cols).not.toContain("session_secret");
    expect(cols).not.toContain("session_token");
    expect(cols).not.toContain("access_token");
    expect(cols).not.toContain("refresh_token");
    expect(cols).not.toContain("password");
    expect(cols).not.toContain("pin");
  });

  it("W. authorization_versions requires existing Membership", async () => {
    await expect(client?.query(`
      INSERT INTO identity.authorization_versions (membership_id) VALUES ($1)
    `, [randomUUID()])).rejects.toThrow();
  });

  it("X. only one authorization_versions row exists per Membership, Y. version defaults to 1, Z. changed_at is TIMESTAMPTZ", async () => {
    const businessId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();

    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Test', 'IDR', 'Asia/Jakarta', 'ACTIVE')`, [businessId]);
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test User', 'ACTIVE')`, [userId]);
    await client?.query(`
      INSERT INTO identity.business_memberships (id, business_id, user_id, status)
      VALUES ($1, $2, $3, 'ACTIVE')
    `, [membershipId, businessId, userId]);

    await client?.query(`INSERT INTO identity.authorization_versions (membership_id) VALUES ($1)`, [membershipId]);

    await expect(client?.query(`INSERT INTO identity.authorization_versions (membership_id) VALUES ($1)`, [membershipId])).rejects.toThrow();

    const res = await client?.query(`SELECT version, pg_typeof(changed_at)::text as type FROM identity.authorization_versions WHERE membership_id = $1`, [membershipId]);
    expect(parseInt(res?.rows[0].version)).toBe(1);
    expect(res?.rows[0].type).toBe("timestamp with time zone");
  });

  it("AA. no automatic version increment trigger is installed", async () => {
    const res = await client?.query(`
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE event_object_schema = 'identity' AND event_object_table = 'authorization_versions'
    `);
    expect(res?.rows.length).toBe(0);
  });

  it("AB. no credential table was added", async () => {
    await expectTableToExist("identity", "credentials", false);
    await expectTableToExist("identity", "passwords", false);
    
    const res = await client?.query(`
      SELECT column_name FROM information_schema.columns WHERE table_schema = 'identity' AND table_name = 'users'
    `);
    const cols = res?.rows.map(r => r.column_name) ?? [];
    expect(cols).not.toContain("password_hash");
    expect(cols).not.toContain("pin_hash");
  });

  it("AC. existing identity tables from M1-002 remain intact", async () => {
    await expectTableToExist("identity", "users");
    await expectTableToExist("identity", "roles");
    await expectTableToExist("identity", "permissions");
    await expectTableToExist("identity", "business_memberships");
  });

  it("AD. permission count includes the D09 catalog plus controlled recovery permission", async () => {
    const res = await client?.query(`SELECT count(*) as count FROM identity.permissions`);
    expect(parseInt(res?.rows[0].count)).toBe(95);
  });

  it("AE. OWNER/ADMIN/CASHIER mappings are 95/71/15 after controlled recovery", async () => {
    const res = await client?.query(`
      SELECT r.code, count(rp.permission_id) as c 
      FROM identity.roles r 
      JOIN identity.role_permissions rp ON r.id = rp.role_id 
      WHERE r.is_system = TRUE 
      GROUP BY r.code
    `);
    const counts = new Map(res?.rows.map(r => [r.code, parseInt(r.c)]));
    expect(counts.get("OWNER")).toBe(95);
    expect(counts.get("ADMIN")).toBe(71);
    expect(counts.get("CASHIER")).toBe(15);
  });

  it("AF. migration rerun applies nothing twice", async () => {
    const url = requireChildDatabaseUrl();
    const applied = await applyMigrations({ databaseUrl: url });
    expect(applied).toEqual([]);
  });
});
