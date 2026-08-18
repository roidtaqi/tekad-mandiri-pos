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

describeWithPostgres("M8: Inventory Schema", () => {
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
  const locationId = randomUUID();
  const categoryId = randomUUID();
  const productId = randomUUID();
  const productUnitId = randomUUID();
  const userId = randomUUID();

  beforeAll(async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    await client.query(`
      INSERT INTO core.businesses (id, name, status, created_at, updated_at)
      VALUES ($1, 'Test Business', 'ACTIVE', NOW(), NOW())
    `, [businessId]);

    await client.query(`
      INSERT INTO core.locations (id, business_id, name, type, status, created_at, updated_at, version)
      VALUES ($1, $2, 'Test Location', 'STORE', 'ACTIVE', NOW(), NOW(), 1)
    `, [locationId, businessId]);

    await client.query(`
      INSERT INTO catalog.categories (id, business_id, name, status, created_at, updated_at, version)
      VALUES ($1, $2, 'Category', 'ACTIVE', NOW(), NOW(), 1)
    `, [categoryId, businessId]);

    await client.query(`
      INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
      VALUES ($1, $2, 'TEST-SKU', 'Test Product', $3, 'PCS', true, 'ACTIVE')
    `, [productId, businessId, categoryId]);
    
    await client.query(`
      INSERT INTO catalog.product_units (id, product_id, unit_code, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status, created_at)
      VALUES ($1, $2, 'PCS', 1, true, true, false, 'ACTIVE', NOW())
    `, [productUnitId, productId]);

    await client.query(`
      INSERT INTO identity.users (id, business_id, email, password_hash, full_name, primary_role, status, created_at, updated_at, version)
      VALUES ($1, $2, 'test@example.com', 'hash', 'Test User', 'ADMIN', 'ACTIVE', NOW(), NOW(), 1)
    `, [userId, businessId]);
  });

  it("can insert stock adjustments and opname sessions", async () => {
    if (client === undefined) throw new Error("client is not initialized.");
    
    const adjustmentId = randomUUID();
    const opnameId = randomUUID();
    const movementId = randomUUID();

    await client.query(`
      INSERT INTO inventory.stock_adjustments (
        id, business_id, location_id, adjustment_number, direction, reason_code, created_by, created_at, posted_at
      )
      VALUES (
        $1, $2, $3, 'ADJ-001', 'IN', 'FOUND', $4, NOW(), NOW()
      )
    `, [adjustmentId, businessId, locationId, userId]);

    await client.query(`
      INSERT INTO inventory.stock_adjustment_items (
        id, adjustment_id, product_id, source_unit_id, qty, conversion_snapshot, base_qty
      )
      VALUES (
        $1, $2, $3, $4, 10, 1, 10
      )
    `, [randomUUID(), adjustmentId, productId, productUnitId]);

    await client.query(`
      INSERT INTO inventory.stock_movements (
        id, business_id, location_id, product_id, movement_type, base_quantity_delta, source_type, source_id, occurred_at
      )
      VALUES (
        $1, $2, $3, $4, 'STOCK_ADJUSTMENT_IN', 10, 'ADJUSTMENT', $5, NOW()
      )
    `, [movementId, businessId, locationId, productId, adjustmentId]);

    await client.query(`
      INSERT INTO inventory.stock_balances (
        business_id, location_id, product_id, base_quantity, last_movement_id, updated_at
      )
      VALUES (
        $1, $2, $3, 10, $4, NOW()
      )
    `, [businessId, locationId, productId, movementId]);

    await client.query(`
      INSERT INTO inventory.opname_sessions (
        id, business_id, location_id, opname_number, status, scope_type, created_by, created_at, version
      )
      VALUES (
        $1, $2, $3, 'OPN-001', 'DRAFT', 'FULL', $4, NOW(), 1
      )
    `, [opnameId, businessId, locationId, userId]);

    const opnameItemRes = await client.query(`
      INSERT INTO inventory.opname_items (
        id, opname_session_id, product_id, count_revision, recount_recommended
      )
      VALUES (
        $1, $2, $3, 0, false
      )
      RETURNING *
    `, [randomUUID(), opnameId, productId]);

    expect(opnameItemRes.rowCount).toBe(1);
  });
});
