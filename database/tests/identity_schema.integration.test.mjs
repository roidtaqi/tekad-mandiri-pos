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

describeWithPostgres("M1-002A: Identity Core Schema and System Roles", () => {
  beforeAll(async () => {
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();

    const databaseName = `kastur_migration_test_${randomUUID().replaceAll("-", "")}`;
    await adminClient.query(`CREATE DATABASE ${quoteGeneratedDatabaseName(databaseName)}`);
    adminUrl.pathname = `/${databaseName}`;

    childDatabaseName = databaseName;
    childDatabaseUrl = adminUrl.toString();

    // A. migration applies after M1-001.
    const url = requireChildDatabaseUrl();
    const applied = await applyMigrations({ databaseUrl: url });
    expect(applied.length).toBeGreaterThan(0);
    expect(applied.map(a => a.filename)).toContain("000001_create_core_businesses_locations.sql");
    expect(applied.map(a => a.filename)).toContain("000002_create_identity_core_schema.sql");

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

  it("B. identity schema exists", async () => {
    const res = await client?.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'identity'`);
    expect(res?.rows.length).toBe(1);
  });

  it("C. all seven authorized tables exist", async () => {
    const res = await client?.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'identity'
    `);
    const tables = res?.rows.map(r => r.table_name) ?? [];
    expect(tables).toEqual(expect.arrayContaining([
      "users", "business_memberships", "roles", "permissions", "role_permissions", "membership_roles", "permission_overrides"
    ]));
  });

  it("D. unauthorized identity tables do NOT exist", async () => {
    const res = await client?.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'identity'
    `);
    const tables = res?.rows.map(r => r.table_name) ?? [];
    expect(tables).not.toContain("terminal_device_assignments");
    expect(tables).not.toContain("credentials");
  });

  it("E. exact expected column types are verified", async () => {
    const res = await client?.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'identity'
    `);
    
    /**
     * @param {string} table
     * @param {string} col
     */
    const getType = (table, col) => res?.rows.find(r => r.table_name === table && r.column_name === col)?.data_type;

    expect(getType('users', 'id')).toBe('uuid');
    expect(getType('users', 'display_name')).toBe('text');
    expect(getType('users', 'email')).toBe('text');
    expect(getType('users', 'phone')).toBe('text');
    expect(getType('users', 'status')).toBe('text');
    expect(getType('users', 'created_at')).toBe('timestamp with time zone');
    expect(getType('users', 'updated_at')).toBe('timestamp with time zone');
    expect(getType('users', 'version')).toBe('bigint');

    expect(getType('business_memberships', 'id')).toBe('uuid');
    expect(getType('business_memberships', 'business_id')).toBe('uuid');
    expect(getType('business_memberships', 'user_id')).toBe('uuid');
    expect(getType('business_memberships', 'status')).toBe('text');
    expect(getType('business_memberships', 'joined_at')).toBe('timestamp with time zone');
    expect(getType('business_memberships', 'updated_at')).toBe('timestamp with time zone');
    expect(getType('business_memberships', 'version')).toBe('bigint');

    expect(getType('roles', 'id')).toBe('uuid');
    expect(getType('roles', 'business_id')).toBe('uuid');
    expect(getType('roles', 'code')).toBe('text');
    expect(getType('roles', 'name')).toBe('text');
    expect(getType('roles', 'is_system')).toBe('boolean');
    expect(getType('roles', 'status')).toBe('text');
    expect(getType('roles', 'created_at')).toBe('timestamp with time zone');
    expect(getType('roles', 'updated_at')).toBe('timestamp with time zone');
    expect(getType('roles', 'version')).toBe('bigint');

    expect(getType('permissions', 'id')).toBe('uuid');
    expect(getType('permissions', 'code')).toBe('text');
    expect(getType('permissions', 'description')).toBe('text');
    expect(getType('permissions', 'risk_level')).toBe('text');
    expect(getType('permissions', 'created_at')).toBe('timestamp with time zone');

    expect(getType('role_permissions', 'role_id')).toBe('uuid');
    expect(getType('role_permissions', 'permission_id')).toBe('uuid');
    expect(getType('role_permissions', 'granted_at')).toBe('timestamp with time zone');

    expect(getType('membership_roles', 'membership_id')).toBe('uuid');
    expect(getType('membership_roles', 'role_id')).toBe('uuid');
    expect(getType('membership_roles', 'is_primary')).toBe('boolean');
    expect(getType('membership_roles', 'assigned_at')).toBe('timestamp with time zone');
    expect(getType('membership_roles', 'assigned_by')).toBe('uuid');

    expect(getType('permission_overrides', 'id')).toBe('uuid');
    expect(getType('permission_overrides', 'membership_id')).toBe('uuid');
    expect(getType('permission_overrides', 'permission_id')).toBe('uuid');
    expect(getType('permission_overrides', 'effect')).toBe('text');
    expect(getType('permission_overrides', 'reason')).toBe('text');
    expect(getType('permission_overrides', 'created_by')).toBe('uuid');
    expect(getType('permission_overrides', 'created_at')).toBe('timestamp with time zone');
  });

  it("F. users accepts ACTIVE/SUSPENDED/INACTIVE", async () => {
    for (const status of ['ACTIVE', 'SUSPENDED', 'INACTIVE']) {
      const result = await client?.query(`
        INSERT INTO identity.users (id, display_name, status)
        VALUES ($1, 'Test User', $2) RETURNING id
      `, [randomUUID(), status]);
      expect(result?.rows.length).toBe(1);
    }
  });

  it("G. invalid user status is rejected", async () => {
    await expect(client?.query(`
      INSERT INTO identity.users (id, display_name, status)
      VALUES ($1, 'Test User', 'INVALID')
    `, [randomUUID()])).rejects.toThrow();
  });

  it("H. membership FK requires existing Business", async () => {
    const userId = randomUUID();
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test', 'ACTIVE')`, [userId]);
    
    await expect(client?.query(`
      INSERT INTO identity.business_memberships (id, business_id, user_id, status)
      VALUES ($1, $2, $3, 'ACTIVE')
    `, [randomUUID(), randomUUID(), userId])).rejects.toThrow();
  });

  it("I. membership FK requires existing User", async () => {
    const businessId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'Test', 'UTC', 'ACTIVE')`, [businessId]);
    
    await expect(client?.query(`
      INSERT INTO identity.business_memberships (id, business_id, user_id, status)
      VALUES ($1, $2, $3, 'ACTIVE')
    `, [randomUUID(), businessId, randomUUID()])).rejects.toThrow();
  });

  it("J. duplicate (business_id, user_id) membership is rejected", async () => {
    const businessId = randomUUID();
    const userId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'Test', 'UTC', 'ACTIVE')`, [businessId]);
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test', 'ACTIVE')`, [userId]);
    
    await client?.query(`
      INSERT INTO identity.business_memberships (id, business_id, user_id, status)
      VALUES ($1, $2, $3, 'ACTIVE')
    `, [randomUUID(), businessId, userId]);

    await expect(client?.query(`
      INSERT INTO identity.business_memberships (id, business_id, user_id, status)
      VALUES ($1, $2, $3, 'ACTIVE')
    `, [randomUUID(), businessId, userId])).rejects.toThrow();
  });

  it("K. membership status constraint works", async () => {
    const businessId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'Test', 'UTC', 'ACTIVE')`, [businessId]);

    for (const status of ['INVITED', 'ACTIVE', 'SUSPENDED', 'INACTIVE']) {
      const userId = randomUUID();
      await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test', 'ACTIVE')`, [userId]);
      const res = await client?.query(`
        INSERT INTO identity.business_memberships (id, business_id, user_id, status)
        VALUES ($1, $2, $3, $4) RETURNING id
      `, [randomUUID(), businessId, userId, status]);
      expect(res?.rows.length).toBe(1);
    }
    
    const userId2 = randomUUID();
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test', 'ACTIVE')`, [userId2]);
    await expect(client?.query(`
      INSERT INTO identity.business_memberships (id, business_id, user_id, status)
      VALUES ($1, $2, $3, 'INVALID')
    `, [randomUUID(), businessId, userId2])).rejects.toThrow();
  });

  it("L. exactly three built-in system role rows exist: OWNER, ADMIN, CASHIER", async () => {
    const res = await client?.query(`SELECT code FROM identity.roles WHERE is_system = TRUE`);
    const codes = res?.rows.map(r => r.code).sort() ?? [];
    expect(codes).toEqual(['ADMIN', 'CASHIER', 'OWNER']);
  });

  it("M. no SUPERVISOR system role exists", async () => {
    const res = await client?.query(`SELECT code FROM identity.roles WHERE code = 'SUPERVISOR'`);
    expect(res?.rows.length).toBe(0);
  });

  it("N. system role rows have: business_id NULL, is_system TRUE, status ACTIVE", async () => {
    const res = await client?.query(`SELECT business_id, is_system, status FROM identity.roles WHERE is_system = TRUE`);
    for (const r of res?.rows || []) {
      expect(r.business_id).toBeNull();
      expect(r.is_system).toBe(true);
      expect(r.status).toBe('ACTIVE');
    }
  });

  it("O. duplicate global system role code is structurally rejected", async () => {
    await expect(client?.query(`
      INSERT INTO identity.roles (id, business_id, code, name, is_system, status)
      VALUES ($1, NULL, 'OWNER', 'Owner 2', TRUE, 'ACTIVE')
    `, [randomUUID()])).rejects.toThrow();
  });

  it("P. two different businesses can be structurally ready for same future custom role code", async () => {
    const businessId1 = randomUUID();
    const businessId2 = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'Test1', 'UTC', 'ACTIVE')`, [businessId1]);
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'Test2', 'UTC', 'ACTIVE')`, [businessId2]);
    
    await client?.query(`
      INSERT INTO identity.roles (id, business_id, code, name, is_system, status)
      VALUES ($1, $2, 'CUSTOM_ROLE', 'Custom Role', FALSE, 'ACTIVE')
    `, [randomUUID(), businessId1]);

    await client?.query(`
      INSERT INTO identity.roles (id, business_id, code, name, is_system, status)
      VALUES ($1, $2, 'CUSTOM_ROLE', 'Custom Role', FALSE, 'ACTIVE')
    `, [randomUUID(), businessId2]);

    await expect(client?.query(`
      INSERT INTO identity.roles (id, business_id, code, name, is_system, status)
      VALUES ($1, $2, 'CUSTOM_ROLE', 'Custom Role', FALSE, 'ACTIVE')
    `, [randomUUID(), businessId1])).rejects.toThrow();
  });

  it("Q. permissions.code is unique", async () => {
    const p1 = randomUUID();
    await client?.query(`INSERT INTO identity.permissions (id, code, risk_level) VALUES ($1, 'P1', 'HIGH')`, [p1]);
    await expect(client?.query(`INSERT INTO identity.permissions (id, code, risk_level) VALUES ($1, 'P1', 'LOW')`, [randomUUID()])).rejects.toThrow();
    await client?.query(`DELETE FROM identity.permissions WHERE id = $1`, [p1]);
  });

  it("R. permission_overrides.effect rejects values other than GRANT/REVOKE", async () => {
    const businessId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const permissionId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'Test', 'UTC', 'ACTIVE')`, [businessId]);
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test', 'ACTIVE')`, [userId]);
    await client?.query(`INSERT INTO identity.business_memberships (id, business_id, user_id, status) VALUES ($1, $2, $3, 'ACTIVE')`, [membershipId, businessId, userId]);
    await client?.query(`INSERT INTO identity.permissions (id, code, risk_level) VALUES ($1, 'P2', 'HIGH')`, [permissionId]);

    await expect(client?.query(`
      INSERT INTO identity.permission_overrides (id, membership_id, permission_id, effect, created_by)
      VALUES ($1, $2, $3, 'INVALID', $4)
    `, [randomUUID(), membershipId, permissionId, userId])).rejects.toThrow();

    const overrideId = randomUUID();
    await client?.query(`
      INSERT INTO identity.permission_overrides (id, membership_id, permission_id, effect, created_by)
      VALUES ($1, $2, $3, 'GRANT', $4)
    `, [overrideId, membershipId, permissionId, userId]);

    await client?.query(`DELETE FROM identity.permission_overrides WHERE id = $1`, [overrideId]);
    await client?.query(`DELETE FROM identity.permissions WHERE id = $1`, [permissionId]);
  });

  it("S. duplicate membership permission override is rejected", async () => {
    const businessId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const permissionId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'Test', 'UTC', 'ACTIVE')`, [businessId]);
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test', 'ACTIVE')`, [userId]);
    await client?.query(`INSERT INTO identity.business_memberships (id, business_id, user_id, status) VALUES ($1, $2, $3, 'ACTIVE')`, [membershipId, businessId, userId]);
    await client?.query(`INSERT INTO identity.permissions (id, code, risk_level) VALUES ($1, 'P3', 'HIGH')`, [permissionId]);

    const overrideId = randomUUID();
    await client?.query(`
      INSERT INTO identity.permission_overrides (id, membership_id, permission_id, effect, created_by)
      VALUES ($1, $2, $3, 'GRANT', $4)
    `, [overrideId, membershipId, permissionId, userId]);

    await expect(client?.query(`
      INSERT INTO identity.permission_overrides (id, membership_id, permission_id, effect, created_by)
      VALUES ($1, $2, $3, 'REVOKE', $4)
    `, [randomUUID(), membershipId, permissionId, userId])).rejects.toThrow();

    await client?.query(`DELETE FROM identity.permission_overrides WHERE id = $1`, [overrideId]);
    await client?.query(`DELETE FROM identity.permissions WHERE id = $1`, [permissionId]);
  });

  it("T. membership_roles composite PK works", async () => {
    const businessId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'Test', 'UTC', 'ACTIVE')`, [businessId]);
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test', 'ACTIVE')`, [userId]);
    await client?.query(`INSERT INTO identity.business_memberships (id, business_id, user_id, status) VALUES ($1, $2, $3, 'ACTIVE')`, [membershipId, businessId, userId]);
    
    await client?.query(`
      INSERT INTO identity.membership_roles (membership_id, role_id, is_primary)
      VALUES ($1, '11111111-1111-4111-8111-111111111111', TRUE)
    `, [membershipId]);

    await expect(client?.query(`
      INSERT INTO identity.membership_roles (membership_id, role_id, is_primary)
      VALUES ($1, '11111111-1111-4111-8111-111111111111', FALSE)
    `, [membershipId])).rejects.toThrow();
  });

  it("U. more than one primary role for same membership is rejected", async () => {
    const businessId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'Test', 'UTC', 'ACTIVE')`, [businessId]);
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test', 'ACTIVE')`, [userId]);
    await client?.query(`INSERT INTO identity.business_memberships (id, business_id, user_id, status) VALUES ($1, $2, $3, 'ACTIVE')`, [membershipId, businessId, userId]);
    
    await client?.query(`
      INSERT INTO identity.membership_roles (membership_id, role_id, is_primary)
      VALUES ($1, '11111111-1111-4111-8111-111111111111', TRUE)
    `, [membershipId]);

    await expect(client?.query(`
      INSERT INTO identity.membership_roles (membership_id, role_id, is_primary)
      VALUES ($1, '22222222-2222-4222-8222-222222222222', TRUE)
    `, [membershipId])).rejects.toThrow();
  });

  it("V. different memberships may each have one primary role", async () => {
    const businessId = randomUUID();
    const userId1 = randomUUID();
    const userId2 = randomUUID();
    const membershipId1 = randomUUID();
    const membershipId2 = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'Test', 'UTC', 'ACTIVE')`, [businessId]);
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test1', 'ACTIVE')`, [userId1]);
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test2', 'ACTIVE')`, [userId2]);
    await client?.query(`INSERT INTO identity.business_memberships (id, business_id, user_id, status) VALUES ($1, $2, $3, 'ACTIVE')`, [membershipId1, businessId, userId1]);
    await client?.query(`INSERT INTO identity.business_memberships (id, business_id, user_id, status) VALUES ($1, $2, $3, 'ACTIVE')`, [membershipId2, businessId, userId2]);
    
    await client?.query(`
      INSERT INTO identity.membership_roles (membership_id, role_id, is_primary)
      VALUES ($1, '11111111-1111-4111-8111-111111111111', TRUE)
    `, [membershipId1]);

    await client?.query(`
      INSERT INTO identity.membership_roles (membership_id, role_id, is_primary)
      VALUES ($1, '22222222-2222-4222-8222-222222222222', TRUE)
    `, [membershipId2]);
  });

  it("W. membership can be assigned OWNER system role", async () => {
    const businessId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'Test', 'UTC', 'ACTIVE')`, [businessId]);
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test', 'ACTIVE')`, [userId]);
    await client?.query(`INSERT INTO identity.business_memberships (id, business_id, user_id, status) VALUES ($1, $2, $3, 'ACTIVE')`, [membershipId, businessId, userId]);
    
    const res = await client?.query(`
      INSERT INTO identity.membership_roles (membership_id, role_id, is_primary)
      VALUES ($1, '11111111-1111-4111-8111-111111111111', TRUE) RETURNING *
    `, [membershipId]);
    expect(res?.rows.length).toBe(1);
    expect(res?.rows[0].role_id).toBe('11111111-1111-4111-8111-111111111111');
  });

  it("X. deleting referenced Business must not silently cascade away identity authorization rows (should restrict)", async () => {
    const businessId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, timezone, status) VALUES ($1, 'Test', 'UTC', 'ACTIVE')`, [businessId]);
    await client?.query(`INSERT INTO identity.users (id, display_name, status) VALUES ($1, 'Test', 'ACTIVE')`, [userId]);
    await client?.query(`INSERT INTO identity.business_memberships (id, business_id, user_id, status) VALUES ($1, $2, $3, 'ACTIVE')`, [membershipId, businessId, userId]);
    
    await expect(client?.query(`DELETE FROM core.businesses WHERE id = $1`, [businessId])).rejects.toThrow();
  });

  it("Y. permission table contains exactly 95 seeded permissions", async () => {
    const res = await client?.query(`SELECT * FROM identity.permissions`);
    expect(res?.rows.length).toBe(95);
  });

  it("Z. role_permissions contains exactly 181 preset mappings", async () => {
    const res = await client?.query(`SELECT * FROM identity.role_permissions`);
    expect(res?.rows.length).toBe(181);
  });

  it("AA. migration history includes 000001, 000002, and 000003", async () => {
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

  it("AB. rerunning migration applies nothing twice", async () => {
    const url = requireChildDatabaseUrl();
    const applied = await applyMigrations({ databaseUrl: url });
    expect(applied).toEqual([]);
  });
});
