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

    await applyMigrations({ databaseUrl: childDatabaseUrl });

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
      INSERT INTO core.businesses (id, name, timezone, status, created_at, updated_at)
      VALUES ($1, 'Test Business', 'Asia/Makassar', 'ACTIVE', NOW(), NOW())
    `, [businessId]);

    await client.query(`
      INSERT INTO core.locations (id, business_id, code, name, type, is_default, status, created_at, updated_at, version)
      VALUES ($1, $2, 'MAIN', 'Test Location', 'STORE', true, 'ACTIVE', NOW(), NOW(), 1)
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
      INSERT INTO catalog.product_units (id, business_id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status, created_at)
      VALUES ($1, $2, $3, 'PCS', 'PCS', 1, true, true, false, 'ACTIVE', NOW())
    `, [productUnitId, businessId, productId]);
  });

  it("can query reporting views", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    await client.query(`
      INSERT INTO inventory.stock_balances (business_id, location_id, product_id, base_quantity, updated_at)
      VALUES ($1, $2, $3, 10, NOW())
    `, [businessId, locationId, productId]);

    await client.query(`
      INSERT INTO costing.product_cost_states (business_id, location_id, product_id, mwa_unit_cost, latest_landed_unit_cost, updated_at)
      VALUES ($1, $2, $3, 100, 100, NOW())
    `, [businessId, locationId, productId]);

    const priceVersionId = randomUUID();
    await client.query(`
      INSERT INTO pricing.price_versions
        (id, business_id, product_unit_id, status, effective_from, tax_mode,
         tax_rate_snapshot, created_by)
      VALUES ($1, $2, $3, 'ACTIVE', NOW() - INTERVAL '1 hour', 'NO_PPN', 0,
              '00000000-0000-0000-0000-000000000000')
    `, [priceVersionId, businessId, productUnitId]);
    await client.query(`
      INSERT INTO pricing.price_tier_versions
        (id, price_version_id, tier_code, min_qty, unit_price, sort_order)
      VALUES ($1, $2, 'RETAIL', 1, 150, 0)
    `, [randomUUID(), priceVersionId]);

    const res = await client.query(`SELECT * FROM reporting.v_inventory_position WHERE product_id = $1`, [productId]);
    expect(res.rowCount).toBe(1);
    expect(Number(res.rows[0].stock_qty)).toBe(10);
    expect(Number(res.rows[0].mwa_cost)).toBe(100);

    const res2 = await client.query(`SELECT * FROM reporting.v_product_commercial_summary WHERE product_id = $1`, [productId]);
    expect(res2.rowCount).toBe(1);
    expect(Number(res2.rows[0].total_stock)).toBe(10);
    expect(Number(res2.rows[0].current_mwa)).toBe(100);
    expect(Number(res2.rows[0].latest_landed)).toBe(100);
    expect(Number(res2.rows[0].active_retail_price)).toBe(150);
  });

  it("preserves unknown cost as NULL instead of reporting fake zero cost", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    const pendingCostProductId = randomUUID();
    await client.query(`
      INSERT INTO catalog.products
        (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
      VALUES ($1, $2, 'PENDING-COST', 'Pending Cost Product', $3, 'PCS', true, 'ACTIVE')
    `, [pendingCostProductId, businessId, categoryId]);
    await client.query(`
      INSERT INTO inventory.stock_balances
        (business_id, location_id, product_id, base_quantity, updated_at)
      VALUES ($1, $2, $3, 3, NOW())
    `, [businessId, locationId, pendingCostProductId]);

    const result = await client.query(`
      SELECT mwa_cost, inventory_value
      FROM reporting.v_inventory_position
      WHERE product_id = $1
    `, [pendingCostProductId]);

    expect(result.rows).toEqual([{ inventory_value: null, mwa_cost: null }]);
  });
});
