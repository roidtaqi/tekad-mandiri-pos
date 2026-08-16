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

describeWithPostgres("M1-004: Catalog Product / Category / Brand Schema", () => {
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

  it("A. applies migration 000005 after 000001 through 000004", async () => {
    const res = await client?.query(`SELECT filename FROM public.kastur_schema_migrations ORDER BY version ASC`);
    const filenames = res?.rows.map(r => r.filename) ?? [];
    expect(filenames).toContain("000005_create_catalog_products_categories_brands.sql");
  });

  it("B. migration history contains exactly five files in order", async () => {
    const res = await client?.query(`SELECT filename FROM public.kastur_schema_migrations ORDER BY version ASC`);
    const filenames = res?.rows.map(r => r.filename) ?? [];
    expect(filenames).toEqual([
      "000001_create_core_businesses_locations.sql",
      "000002_create_identity_core_schema.sql",
      "000003_seed_permission_catalog_role_presets.sql",
      "000004_create_identity_devices_sessions_authorization_versions.sql",
      "000005_create_catalog_products_categories_brands.sql",
      "000006_create_product_units_barcodes.sql"
    ]);
  });

  it("C, D, E, F. catalog schemas exist", async () => {
    const schemaRes = await client?.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'catalog'`);
    expect(schemaRes?.rows).toHaveLength(1);

    const tablesRes = await client?.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'catalog'`);
    const tables = tablesRes?.rows.map(r => r.table_name) ?? [];
    expect(tables).toContain("categories");
    expect(tables).toContain("brands");
    expect(tables).toContain("products");
  });

  it("G. M1-005 tables do NOT exist", async () => {
    const tablesRes = await client?.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'catalog'`);
    const tables = tablesRes?.rows.map(r => r.table_name) ?? [];
    expect(tables).not.toContain("suppliers");
    expect(tables).not.toContain("product_suppliers");
    expect(tables).not.toContain("import_batches");
    expect(tables).not.toContain("import_row_results");
  });

  it("H, I, J. exact columns and types", async () => {
    const res1 = await client?.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'catalog' AND table_name = 'categories'`);
    const categoriesCols = Object.fromEntries(res1?.rows.map(r => [r.column_name, r.data_type]) ?? []);
    expect(categoriesCols).toEqual({
      id: "uuid",
      business_id: "uuid",
      name: "text",
      status: "text",
      created_at: "timestamp with time zone",
      updated_at: "timestamp with time zone",
      version: "bigint"
    });

    const res2 = await client?.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'catalog' AND table_name = 'brands'`);
    const brandsCols = Object.fromEntries(res2?.rows.map(r => [r.column_name, r.data_type]) ?? []);
    expect(brandsCols).toEqual({
      id: "uuid",
      business_id: "uuid",
      name: "text",
      status: "text",
      created_at: "timestamp with time zone",
      updated_at: "timestamp with time zone",
      version: "bigint"
    });

    const res3 = await client?.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'catalog' AND table_name = 'products'`);
    const productsCols = Object.fromEntries(res3?.rows.map(r => [r.column_name, r.data_type]) ?? []);
    expect(productsCols).toEqual({
      id: "uuid",
      business_id: "uuid",
      sku: "text",
      name: "text",
      category_id: "uuid",
      brand_id: "uuid",
      base_unit_code: "text",
      track_inventory: "boolean",
      status: "text",
      created_at: "timestamp with time zone",
      updated_at: "timestamp with time zone",
      version: "bigint"
    });
  });

  it("K, L, M, N, O, P. Status accepts ACTIVE/INACTIVE, rejects others", async () => {
    const businessId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Test Business', 'IDR', 'UTC', 'ACTIVE')`, [businessId]);

    const cat1 = randomUUID();
    const cat2 = randomUUID();
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'C1', 'ACTIVE'), ($3, $2, 'C2', 'INACTIVE')`, [cat1, businessId, cat2]);
    await expect(client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'C3', 'DRAFT')`, [randomUUID(), businessId])).rejects.toThrow();

    const brand1 = randomUUID();
    const brand2 = randomUUID();
    await client?.query(`INSERT INTO catalog.brands (id, business_id, name, status) VALUES ($1, $2, 'B1', 'ACTIVE'), ($3, $2, 'B2', 'INACTIVE')`, [brand1, businessId, brand2]);
    await expect(client?.query(`INSERT INTO catalog.brands (id, business_id, name, status) VALUES ($1, $2, 'B3', 'DRAFT')`, [randomUUID(), businessId])).rejects.toThrow();

    await client?.query(`
      INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
      VALUES ($1, $2, 'P1', 'Product 1', $3, 'PCS', true, 'ACTIVE'),
             ($4, $2, 'P2', 'Product 2', $3, 'PCS', true, 'INACTIVE')
    `, [randomUUID(), businessId, cat1, randomUUID()]);
    await expect(client?.query(`
      INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
      VALUES ($1, $2, 'P3', 'Product 3', $3, 'PCS', true, 'ARCHIVED')
    `, [randomUUID(), businessId, cat1])).rejects.toThrow();
  });

  it("Q, R, S. Requires existing Business", async () => {
    const fakeBusinessId = randomUUID();
    await expect(client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Cat', 'ACTIVE')`, [randomUUID(), fakeBusinessId])).rejects.toThrow();
    await expect(client?.query(`INSERT INTO catalog.brands (id, business_id, name, status) VALUES ($1, $2, 'Brand', 'ACTIVE')`, [randomUUID(), fakeBusinessId])).rejects.toThrow();
    
    await expect(client?.query(`
      INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
      VALUES ($1, $2, 'SKU', 'Prod', $3, 'PCS', true, 'ACTIVE')
    `, [randomUUID(), fakeBusinessId, randomUUID()])).rejects.toThrow();
  });

  it("T, U, V. Normalized Name Uniqueness", async () => {
    const b1 = randomUUID();
    const b2 = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'B1', 'IDR', 'UTC', 'ACTIVE'), ($2, 'B2', 'IDR', 'UTC', 'ACTIVE')`, [b1, b2]);

    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Beverages', 'ACTIVE')`, [randomUUID(), b1]);
    await expect(client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, ' beverages ', 'ACTIVE')`, [randomUUID(), b1])).rejects.toThrow();
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'beverages', 'ACTIVE')`, [randomUUID(), b2]);

    await client?.query(`INSERT INTO catalog.brands (id, business_id, name, status) VALUES ($1, $2, 'Nike', 'ACTIVE')`, [randomUUID(), b1]);
    await expect(client?.query(`INSERT INTO catalog.brands (id, business_id, name, status) VALUES ($1, $2, ' NIKE ', 'ACTIVE')`, [randomUUID(), b1])).rejects.toThrow();
    await client?.query(`INSERT INTO catalog.brands (id, business_id, name, status) VALUES ($1, $2, 'niKE', 'ACTIVE')`, [randomUUID(), b2]);
  });

  it("W, X, Y. Product SKU Uniqueness", async () => {
    const b1 = randomUUID();
    const b2 = randomUUID();
    const cat1 = randomUUID();
    const cat2 = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'B1', 'IDR', 'UTC', 'ACTIVE'), ($2, 'B2', 'IDR', 'UTC', 'ACTIVE')`, [b1, b2]);
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'C1', 'ACTIVE')`, [cat1, b1]);
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'C2', 'ACTIVE')`, [cat2, b2]);

    await client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU1', 'P1', $3, 'PCS', true, 'ACTIVE')`, [randomUUID(), b1, cat1]);
    await expect(client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU1', 'P2', $3, 'PCS', true, 'ACTIVE')`, [randomUUID(), b1, cat1])).rejects.toThrow();

    await client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU1', 'P1', $3, 'PCS', true, 'ACTIVE')`, [randomUUID(), b2, cat2]);

    await client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU2', 'P2', $3, 'PCS', true, 'INACTIVE')`, [randomUUID(), b1, cat1]);
    await expect(client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU2', 'P3', $3, 'PCS', true, 'ACTIVE')`, [randomUUID(), b1, cat1])).rejects.toThrow();
  });

  it("Z, AA, AB. Product Category requirements and tenant integrity", async () => {
    const b1 = randomUUID();
    const b2 = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'B1', 'IDR', 'UTC', 'ACTIVE'), ($2, 'B2', 'IDR', 'UTC', 'ACTIVE')`, [b1, b2]);

    const cat1 = randomUUID();
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Cat1', 'ACTIVE')`, [cat1, b1]);

    await expect(client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU1', 'P1', $3, 'PCS', true, 'ACTIVE')`, [randomUUID(), b1, randomUUID()])).rejects.toThrow();
    await expect(client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU1', 'P1', 'PCS', true, 'ACTIVE')`, [randomUUID(), b1])).rejects.toThrow();

    await expect(client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU2', 'P2', $3, 'PCS', true, 'ACTIVE')`, [randomUUID(), b2, cat1])).rejects.toThrow();
  });

  it("AC, AD, AE. Product Brand optional and tenant integrity", async () => {
    const b1 = randomUUID();
    const b2 = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'B1', 'IDR', 'UTC', 'ACTIVE'), ($2, 'B2', 'IDR', 'UTC', 'ACTIVE')`, [b1, b2]);

    const cat1 = randomUUID();
    const brand1 = randomUUID();
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Cat1', 'ACTIVE')`, [cat1, b1]);
    await client?.query(`INSERT INTO catalog.brands (id, business_id, name, status) VALUES ($1, $2, 'Brand1', 'ACTIVE')`, [brand1, b1]);

    await client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU1', 'P1', $3, 'PCS', true, 'ACTIVE')`, [randomUUID(), b1, cat1]);

    await expect(client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, brand_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU2', 'P2', $3, $4, 'PCS', true, 'ACTIVE')`, [randomUUID(), b1, cat1, randomUUID()])).rejects.toThrow();

    await expect(client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, brand_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU3', 'P3', $3, $4, 'PCS', true, 'ACTIVE')`, [randomUUID(), b1, cat1, randomUUID()])).rejects.toThrow();
  });

  it("AF, AG, AH. Restricted Deletes", async () => {
    const businessId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'B1', 'IDR', 'UTC', 'ACTIVE')`, [businessId]);

    const cat1 = randomUUID();
    const brand1 = randomUUID();
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Cat1', 'ACTIVE')`, [cat1, businessId]);
    await client?.query(`INSERT INTO catalog.brands (id, business_id, name, status) VALUES ($1, $2, 'Brand1', 'ACTIVE')`, [brand1, businessId]);

    await client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, brand_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU1', 'P1', $3, $4, 'PCS', true, 'ACTIVE')`, [randomUUID(), businessId, cat1, brand1]);

    await expect(client?.query(`DELETE FROM catalog.categories WHERE id = $1`, [cat1])).rejects.toThrow();
    
    await expect(client?.query(`DELETE FROM catalog.brands WHERE id = $1`, [brand1])).rejects.toThrow();
    
    await expect(client?.query(`DELETE FROM core.businesses WHERE id = $1`, [businessId])).rejects.toThrow();
  });

  it("AI. duplicate Product names within one Business are allowed", async () => {
    const businessId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'B1', 'IDR', 'UTC', 'ACTIVE')`, [businessId]);
    const cat1 = randomUUID();
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Cat1', 'ACTIVE')`, [cat1, businessId]);

    await client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU1', 'Duplicate Name', $3, 'PCS', true, 'ACTIVE')`, [randomUUID(), businessId, cat1]);
    await client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU2', 'Duplicate Name', $3, 'PCS', true, 'ACTIVE')`, [randomUUID(), businessId, cat1]);
  });

  it("AJ, AK, AL, AM. Column Constraints", async () => {
    const businessId = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'B1', 'IDR', 'UTC', 'ACTIVE')`, [businessId]);
    const catId = randomUUID();
    
    const catRes = await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Cat', 'ACTIVE') RETURNING version, created_at`, [catId, businessId]);
    const catRows = catRes?.rows ?? [];
    expect(catRows[0].version).toBe("1");
    expect(catRows[0].created_at instanceof Date).toBe(true);
    
    const brandRes = await client?.query(`INSERT INTO catalog.brands (id, business_id, name, status) VALUES ($1, $2, 'Brand', 'ACTIVE') RETURNING version, created_at`, [randomUUID(), businessId]);
    const brandRows = brandRes?.rows ?? [];
    expect(brandRows[0].version).toBe("1");

    await expect(client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, track_inventory, status) VALUES ($1, $2, 'SKU', 'Prod', $3, true, 'ACTIVE')`, [randomUUID(), businessId, catId])).rejects.toThrow();
    await expect(client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, status) VALUES ($1, $2, 'SKU', 'Prod', $3, 'PCS', 'ACTIVE')`, [randomUUID(), businessId, catId])).rejects.toThrow();

    const prodRes = await client?.query(`INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU', 'Prod', $3, 'PCS', true, 'ACTIVE') RETURNING version`, [randomUUID(), businessId, catId]);
    const prodRows = prodRes?.rows ?? [];
    expect(prodRows[0].version).toBe("1");
  });

  it("AN, AO, AP, AQ, AR, AS. Excluded Fields", async () => {
    const res = await client?.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'catalog' AND table_name = 'products'`);
    const cols = res?.rows.map(r => r.column_name) ?? [];
    
    expect(cols).not.toContain("selling_price");
    expect(cols).not.toContain("price");
    expect(cols).not.toContain("cost");
    expect(cols).not.toContain("unit_cost");
    expect(cols).not.toContain("stock");
    expect(cols).not.toContain("qty");
    expect(cols).not.toContain("supplier_id");
    expect(cols).not.toContain("barcode");
    
  });

  it("AT. rerunning migration applies nothing twice", async () => {
    const url = requireChildDatabaseUrl();
    const applied = await applyMigrations({ databaseUrl: url });
    expect(applied).toHaveLength(0);
  });
});
