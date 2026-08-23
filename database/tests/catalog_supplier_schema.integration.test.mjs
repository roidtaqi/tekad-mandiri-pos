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

describeWithPostgres("M5-001: Catalog Supplier and ProductSupplier Schema", () => {
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
  const categoryId = randomUUID();
  const productId = randomUUID();
  const supplierId = randomUUID();

  beforeAll(async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    await client.query(`
      INSERT INTO core.businesses (id, name, timezone, status, created_at, updated_at)
      VALUES ($1, 'Test Business', 'Asia/Makassar', 'ACTIVE', NOW(), NOW())
    `, [businessId]);

    await client.query(`
      INSERT INTO catalog.categories (id, business_id, name, status, created_at, updated_at, version)
      VALUES ($1, $2, 'Category', 'ACTIVE', NOW(), NOW(), 1)
    `, [categoryId, businessId]);

    await client.query(`
      INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
      VALUES ($1, $2, 'TEST-SKU', 'Test Product', $3, 'PCS', true, 'ACTIVE')
    `, [productId, businessId, categoryId]);
  });

  it("can insert a supplier", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    const res = await client.query(`
      INSERT INTO catalog.suppliers (id, business_id, code, name, phone, email, address, status, created_at, updated_at, version)
      VALUES ($1, $2, 'SUPP-1', 'Test Supplier', '123456789', 'supp@test.com', 'Address 1', 'ACTIVE', NOW(), NOW(), 1)
      RETURNING *
    `, [supplierId, businessId]);

    expect(res.rowCount).toBe(1);
    expect(res.rows[0].id).toBe(supplierId);
    expect(res.rows[0].name).toBe('Test Supplier');
  });

  it("can insert a product_supplier", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    const res = await client.query(`
      INSERT INTO catalog.product_suppliers (product_id, supplier_id, supplier_sku, is_preferred, status, created_at)
      VALUES ($1, $2, 'SUPP-SKU-1', true, 'ACTIVE', NOW())
      RETURNING *
    `, [productId, supplierId]);

    expect(res.rowCount).toBe(1);
    expect(res.rows[0].product_id).toBe(productId);
    expect(res.rows[0].supplier_id).toBe(supplierId);
    expect(res.rows[0].is_preferred).toBe(true);
  });
});
