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

describeWithPostgres("M9: Returns Schema", () => {
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
  const terminalId = randomUUID();
  const shiftId = randomUUID();
  const transactionId = randomUUID();

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

    await client.query(`
      INSERT INTO cash.terminals (id, business_id, location_id, name, status, created_at, updated_at, version)
      VALUES ($1, $2, $3, 'Terminal 1', 'ACTIVE', NOW(), NOW(), 1)
    `, [terminalId, businessId, locationId]);

    await client.query(`
      INSERT INTO cash.shifts (id, business_id, location_id, terminal_id, opened_by, status, opened_at, expected_drawer_amount, created_at, updated_at, version)
      VALUES ($1, $2, $3, $4, $5, 'OPEN', NOW(), 0, NOW(), NOW(), 1)
    `, [shiftId, businessId, locationId, terminalId, userId]);

    await client.query(`
      INSERT INTO sales.transactions (
        id, business_id, location_id, terminal_id, device_id, shift_id, transaction_number, status, 
        subtotal, promotion_discount_total, line_discount_total, transaction_discount_total, tax_total, grand_total, total_paid, change_amount, cost_status, created_by, occurred_at, created_at
      )
      VALUES (
        $1, $2, $3, $4, $4, $5, 'TRX-001', 'COMPLETED',
        100, 0, 0, 0, 0, 100, 100, 0, 'FINAL', $6, NOW(), NOW()
      )
    `, [transactionId, businessId, locationId, terminalId, shiftId, userId]);

    await client.query(`
      INSERT INTO sales.transaction_items (
        id, transaction_id, product_id, product_unit_id, product_name_snapshot, sku_snapshot, unit_name_snapshot, conversion_snapshot, 
        quantity, base_quantity, base_unit_price_snapshot, promotion_discount_snapshot, manual_line_discount_snapshot, transaction_discount_allocation, 
        final_unit_price_snapshot, line_total, tax_mode_snapshot, tax_rate_snapshot, tax_amount_snapshot, cost_status, created_at
      )
      VALUES (
        $1, $2, $3, $4, 'Test Product', 'TEST-SKU', 'PCS', 1,
        1, 1, 100, 0, 0, 0,
        100, 100, 'TAX_INCLUSIVE', 0, 0, 'FINAL', NOW()
      )
    `, [randomUUID(), transactionId, productId, productUnitId]);
  });

  it("can insert returns and items", async () => {
    if (client === undefined) throw new Error("client is not initialized.");
    
    const returnId = randomUUID();

    await client.query(`
      INSERT INTO returns.customer_returns (
        id, business_id, location_id, return_number, original_transaction_id, status, refund_status, return_total, refunded_total, reason_code, created_by, created_at, version
      )
      VALUES (
        $1, $2, $3, 'RET-001', $4, 'COMPLETED', 'PENDING', 100, 0, 'DAMAGED', $5, NOW(), 1
      )
    `, [returnId, businessId, locationId, transactionId, userId]);

    const itemRes = await client.query(`
      INSERT INTO returns.return_items (
        id, customer_return_id, original_transaction_item_id, product_id, product_unit_id, return_qty, base_return_qty, refund_unit_price, refund_total, disposition, reason_code
      )
      VALUES (
        $1, $2, (SELECT id FROM sales.transaction_items WHERE transaction_id = $3), $4, $5, 1, 1, 100, 100, 'RESTOCK', 'DAMAGED'
      )
      RETURNING *
    `, [randomUUID(), returnId, transactionId, productId, productUnitId]);

    expect(itemRes.rowCount).toBe(1);
  });
});
