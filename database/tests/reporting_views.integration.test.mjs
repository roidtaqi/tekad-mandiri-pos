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

describeWithPostgres("M11: Reporting Views", () => {
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
  });

  it("can query reporting views", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    await client.query(`
      INSERT INTO inventory.stock_balances (business_id, location_id, product_id, base_quantity, updated_at)
      VALUES ($1, $2, $3, 10, NOW())
    `, [businessId, locationId, productId]);

    await client.query(`
      INSERT INTO costing.product_cost_states (business_id, location_id, product_id, unit_mwa, latest_landed_cost, cost_status, updated_at, version)
      VALUES ($1, $2, $3, 100, 100, 'FINAL', NOW(), 1)
    `, [businessId, locationId, productId]);

    const res = await client.query(`SELECT * FROM reporting.v_inventory_position WHERE product_id = $1`, [productId]);
    expect(res.rowCount).toBe(1);
    expect(Number(res.rows[0].stock_qty)).toBe(10);
    expect(Number(res.rows[0].mwa_cost)).toBe(100);

    const res2 = await client.query(`SELECT * FROM reporting.v_product_commercial_summary WHERE product_id = $1`, [productId]);
    expect(res2.rowCount).toBe(1);
    expect(Number(res2.rows[0].total_stock)).toBe(10);
  });
});
