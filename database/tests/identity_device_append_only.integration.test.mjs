// @ts-check

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../scripts/migrations.mjs";

const configuredAdminUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = configuredAdminUrl === undefined ? describe.skip : describe;

/** @type {Client | undefined} */
let adminClient;
/** @type {Client | undefined} */
let client;
/** @type {string | undefined} */
let childDatabaseName;

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

describeWithPostgres("identity/device tenant integrity and append-only authorities", () => {
  const businessA = randomUUID();
  const businessB = randomUUID();
  const locationA = randomUUID();
  const locationB = randomUUID();
  const userId = randomUUID();
  const membershipA = randomUUID();
  const deviceA = randomUUID();
  const deviceB = randomUUID();
  const categoryA = randomUUID();
  const productA = randomUUID();
  const terminalA = randomUUID();
  const shiftA = randomUUID();

  beforeAll(async () => {
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();

    childDatabaseName = `kastur_migration_test_${randomUUID().replaceAll("-", "")}`;
    await adminClient.query(`CREATE DATABASE ${quoteGeneratedDatabaseName(childDatabaseName)}`);
    const childUrl = requireSafeAdminUrl();
    childUrl.pathname = `/${childDatabaseName}`;
    await applyMigrations({ databaseUrl: childUrl.toString() });
    client = new Client({ connectionString: childUrl.toString() });
    await client.connect();

    await client.query(
      `INSERT INTO core.businesses (id, name, timezone, status)
       VALUES ($1, 'Business A', 'Asia/Makassar', 'ACTIVE'),
              ($2, 'Business B', 'Asia/Makassar', 'ACTIVE')`,
      [businessA, businessB],
    );
    await client.query(
      `INSERT INTO core.locations
         (id, business_id, code, name, type, is_default, status)
       VALUES ($1, $2, 'A', 'Location A', 'STORE', TRUE, 'ACTIVE'),
              ($3, $4, 'B', 'Location B', 'STORE', TRUE, 'ACTIVE')`,
      [locationA, businessA, locationB, businessB],
    );
    await client.query(
      `INSERT INTO identity.users (id, display_name, status)
       VALUES ($1, 'Operator', 'ACTIVE')`,
      [userId],
    );
    await client.query(
      `INSERT INTO identity.business_memberships (id, business_id, user_id, status)
       VALUES ($1, $2, $3, 'ACTIVE')`,
      [membershipA, businessA, userId],
    );
    await client.query(
      `INSERT INTO identity.devices (id, business_id, device_key, status)
       VALUES ($1, $2, 'device-a', 'ACTIVE'), ($3, $4, 'device-b', 'ACTIVE')`,
      [deviceA, businessA, deviceB, businessB],
    );
    await client.query(
      `INSERT INTO catalog.categories (id, business_id, name, status)
       VALUES ($1, $2, 'Category A', 'ACTIVE')`,
      [categoryA, businessA],
    );
    await client.query(
      `INSERT INTO catalog.products
         (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
       VALUES ($1, $2, 'SKU-A', 'Product A', $3, 'PCS', TRUE, 'ACTIVE')`,
      [productA, businessA, categoryA],
    );
    await client.query(
      `INSERT INTO core.terminals (id, business_id, location_id, code, name, status)
       VALUES ($1, $2, $3, 'POS-A', 'POS A', 'ACTIVE')`,
      [terminalA, businessA, locationA],
    );
    await client.query(
      `INSERT INTO cash.shifts
         (id, business_id, location_id, terminal_id, cashier_user_id, shift_number,
          status, opening_cash, opened_at, review_status)
       VALUES ($1, $2, $3, $4, $5, 'SHIFT-A', 'OPEN', 0, CURRENT_TIMESTAMP, 'UNREVIEWED')`,
      [shiftA, businessA, locationA, terminalA, userId],
    );
  });

  afterAll(async () => {
    if (client !== undefined) await client.end();
    if (adminClient !== undefined) {
      if (childDatabaseName !== undefined) {
        await adminClient.query(
          `DROP DATABASE ${quoteGeneratedDatabaseName(childDatabaseName)} WITH (FORCE)`,
        );
      }
      await adminClient.end();
    }
  });

  it("rejects inactive and cross-Business role assignments", async () => {
    if (client === undefined) throw new Error("client is not initialized.");
    const foreignRole = randomUUID();
    const inactiveRole = randomUUID();
    await client.query(
      `INSERT INTO identity.roles (id, business_id, code, name, is_system, status)
       VALUES ($1, $2, 'FOREIGN', 'Foreign', FALSE, 'ACTIVE'),
              ($3, $4, 'INACTIVE', 'Inactive', FALSE, 'INACTIVE')`,
      [foreignRole, businessB, inactiveRole, businessA],
    );

    await expect(
      client.query(
        `INSERT INTO identity.membership_roles (membership_id, role_id, is_primary)
         VALUES ($1, $2, FALSE)`,
        [membershipA, foreignRole],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      client.query(
        `INSERT INTO identity.membership_roles (membership_id, role_id, is_primary)
         VALUES ($1, $2, FALSE)`,
        [membershipA, inactiveRole],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      client.query(
        `INSERT INTO identity.membership_roles (membership_id, role_id, is_primary)
         VALUES ($1, '11111111-1111-4111-8111-111111111111', TRUE)`,
        [membershipA],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it("rejects cross-Business device references in sessions and sync state", async () => {
    if (client === undefined) throw new Error("client is not initialized.");
    await expect(
      client.query(
        `INSERT INTO identity.sessions
           (id, user_id, business_id, device_id, session_secret_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
        [randomUUID(), userId, businessA, deviceB, `hash-${randomUUID()}`],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      client.query(
        `INSERT INTO sync.device_sync_states (business_id, device_id)
         VALUES ($1, $2)`,
        [businessA, deviceB],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("allows inserts but rejects UPDATE and DELETE on authoritative ledgers and Audit", async () => {
    if (client === undefined) throw new Error("client is not initialized.");
    const databaseClient = client;
    const cashId = randomUUID();
    const stockId = randomUUID();
    const costId = randomUUID();
    const auditId = randomUUID();

    await databaseClient.query(
      `INSERT INTO cash.cash_movements
         (id, business_id, location_id, terminal_id, shift_id, movement_type,
          amount, direction, source_type, source_id, occurred_at, actor_user_id, device_id)
       VALUES ($1, $2, $3, $4, $5, 'CASH_IN', 10, 'IN', 'TEST', $6,
               CURRENT_TIMESTAMP, $7, $8)`,
      [cashId, businessA, locationA, terminalA, shiftA, randomUUID(), userId, deviceA],
    );
    await databaseClient.query(
      `INSERT INTO inventory.stock_movements
         (id, business_id, location_id, product_id, movement_type,
          base_quantity_delta, source_type, source_id, occurred_at, actor_user_id, device_id)
       VALUES ($1, $2, $3, $4, 'INITIAL_STOCK', 1, 'TEST', $5,
               CURRENT_TIMESTAMP, $6, $7)`,
      [stockId, businessA, locationA, productA, randomUUID(), userId, deviceA],
    );
    await databaseClient.query(
      `INSERT INTO costing.cost_events
         (id, business_id, location_id, product_id, event_type, quantity_basis,
          unit_cost_before, unit_cost_after, value_delta, source_type, source_id,
          occurred_at, actor_user_id)
       VALUES ($1, $2, $3, $4, 'INITIAL_COST', 1, 0, 10, 10, 'TEST', $5,
               CURRENT_TIMESTAMP, $6)`,
      [costId, businessA, locationA, productA, randomUUID(), userId],
    );
    await databaseClient.query(
      `INSERT INTO audit.audit_events
         (id, business_id, location_id, actor_type, actor_user_id, action,
          entity_type, entity_id, occurred_at, device_id)
       VALUES ($1, $2, $3, 'USER', $4, 'TEST_EVENT', 'test_entity', $5,
               CURRENT_TIMESTAMP, $6)`,
      [auditId, businessA, locationA, userId, randomUUID(), deviceA],
    );

    for (const mutation of [
      () => databaseClient.query(`UPDATE cash.cash_movements SET notes = 'changed' WHERE id = $1`, [cashId]),
      () => databaseClient.query(`DELETE FROM inventory.stock_movements WHERE id = $1`, [stockId]),
      () => databaseClient.query(`UPDATE costing.cost_events SET reason = 'changed' WHERE id = $1`, [costId]),
      () => databaseClient.query(`DELETE FROM audit.audit_events WHERE id = $1`, [auditId]),
    ]) {
      await expect(mutation()).rejects.toMatchObject({ code: "55000" });
    }
  });
});
