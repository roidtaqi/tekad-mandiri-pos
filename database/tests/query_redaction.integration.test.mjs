// @ts-check

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../scripts/migrations.mjs";
import { listProducts, getProductDetail, listCategories, listBrands, buildPosCatalogBootstrapProjection } from "@kastur/domain";
import { CatalogError } from "@kastur/contracts";

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

describeWithPostgres("Query Redaction & Security Integration", () => {
  beforeAll(async () => {
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.href });
    await adminClient.connect();

    childDatabaseName = `kastur_ci_test_redaction_${Date.now()}_${randomUUID().replace(/-/g, "").substring(0, 8)}`;

    const createDbRes = await adminClient.query(`CREATE DATABASE ${childDatabaseName}`);
    if (createDbRes.command !== "CREATE") {
      throw new Error(`Failed to create database ${childDatabaseName}`);
    }

    const childUrl = new URL(adminUrl.href);
    childUrl.pathname = `/${childDatabaseName}`;
    childDatabaseUrl = childUrl.href;

    await applyMigrations({ databaseUrl: childDatabaseUrl });

    client = new Client({ connectionString: childDatabaseUrl });
    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
    if (adminClient && childDatabaseName) {
      await adminClient.query(`DROP DATABASE IF EXISTS ${childDatabaseName} WITH (FORCE)`);
      await adminClient.end();
    }
  });

  const bId = randomUUID();
  const cId = randomUUID();
  const brandId = randomUUID();
  const pId = randomUUID();
  const puId = randomUUID();
  const bcId = randomUUID();

  // Test setup
  beforeAll(async () => {
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Biz1', 'IDR', 'UTC', 'ACTIVE')`, [bId]);
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Cat1', 'ACTIVE')`, [cId, bId]);
    await client?.query(`INSERT INTO catalog.brands (id, business_id, name, status) VALUES ($1, $2, 'Brand1', 'ACTIVE')`, [brandId, bId]);
    await client?.query(`
      INSERT INTO catalog.products (id, business_id, sku, name, category_id, brand_id, base_unit_code, track_inventory, status)
      VALUES ($1, $2, 'SKU-1', 'Product 1', $3, $4, 'PCS', true, 'ACTIVE')
    `, [pId, bId, cId, brandId]);
    await client?.query(`
      INSERT INTO catalog.product_units (id, business_id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status)
      VALUES ($1, $2, $3, 'PCS', 'Pieces', 1, true, true, false, 'ACTIVE')
    `, [puId, bId, pId]);
    await client?.query(`
      INSERT INTO catalog.barcodes (id, business_id, product_unit_id, barcode, is_internal, status)
      VALUES ($1, $2, $3, '00123', false, 'ACTIVE')
    `, [bcId, bId, puId]);
    
    // Other business
    const bId2 = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Biz2', 'IDR', 'UTC', 'ACTIVE')`, [bId2]);
    const cId2 = randomUUID();
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Cat2', 'ACTIVE')`, [cId2, bId2]);
    const pId2 = randomUUID();
    await client?.query(`
      INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
      VALUES ($1, $2, 'SKU-B2', 'Product B2', $3, 'BOX', false, 'ACTIVE')
    `, [pId2, bId2, cId2]);
  });

  const baseCtx = { business_id: bId, user_id: randomUUID(), permissions: new Set(["product.read"]) };
  
  const broadCtx = { 
    business_id: bId, 
    user_id: randomUUID(), 
    permissions: new Set([
      "product.read", "workspace.pos.access", "cost.read", "pricing.read", "inventory.read", "supplier.read", "audit.sensitive.read"
    ]) 
  };
  
  const posCtx = { business_id: bId, user_id: randomUUID(), permissions: new Set(["workspace.pos.access"]) };

  const deniedCtx = { business_id: bId, user_id: randomUUID(), permissions: new Set(["cost.read", "pricing.read"]) };

  /** @type {import("@kastur/domain").SqlExecutor} */
  const executor = {
    // @ts-ignore
    query: async (text, params) => {
      if (!client) throw new Error("Client not connected");
      return client.query(text, params);
    }
  };

  it("1. Product List has exact safe shape and broad permission does not widen it", async () => {
    const res = await listProducts(broadCtx, executor, {});
    expect(res.items).toHaveLength(1);
    
    const p = res.items[0];
    expect(p).toBeDefined();
    if (!p) throw new Error("Missing product");

    const expectedKeys = [
      "id", "sku", "name", "base_unit_code", "track_inventory", "status", "version", "category", "brand"
    ];
    expect(Object.keys(p).sort()).toEqual(expectedKeys.sort());

    const expectedCategoryKeys = ["id", "name"];
    expect(Object.keys(p.category).sort()).toEqual(expectedCategoryKeys.sort());
    
    // Proof missing future domains
    expect("cost" in p).toBe(false);
    expect("stock" in p).toBe(false);
  });

  it("2. Product Detail has exact safe shape and broad permission does not widen it", async () => {
    const res = await getProductDetail(broadCtx, executor, pId);
    
    const expectedKeys = [
      "id", "sku", "name", "base_unit_code", "track_inventory", "status", "version", "created_at", "updated_at", "category", "brand", "units"
    ];
    expect(Object.keys(res).sort()).toEqual(expectedKeys.sort());

    const u = res.units[0];
    expect(u).toBeDefined();
    if (!u) throw new Error("Missing unit");

    const expectedUnitKeys = [
      "id", "unit_code", "display_name", "conversion_factor", "can_sell", "can_purchase", "allow_decimal_qty", "status", "version", "barcodes"
    ];
    expect(Object.keys(u).sort()).toEqual(expectedUnitKeys.sort());

    const b = u.barcodes[0];
    expect(b).toBeDefined();
    if (!b) throw new Error("Missing barcode");

    const expectedBarcodeKeys = [
      "id", "barcode", "is_internal", "status", "deactivated_at"
    ];
    expect(Object.keys(b).sort()).toEqual(expectedBarcodeKeys.sort());

    // Proof conversions remain intact
    expect(typeof u.conversion_factor).toBe("string");
    expect(typeof b.barcode).toBe("string");
  });

  it("3. Categories and Brands exact safe shapes", async () => {
    const cRes = await listCategories(baseCtx, executor);
    const bRes = await listBrands(baseCtx, executor);

    const c0 = cRes[0];
    expect(c0).toBeDefined();
    if (!c0) throw new Error("Missing category");

    const b0 = bRes[0];
    expect(b0).toBeDefined();
    if (!b0) throw new Error("Missing brand");

    expect(Object.keys(c0).sort()).toEqual(["id", "name"].sort());
    expect(Object.keys(b0).sort()).toEqual(["id", "name"].sort());
  });

  it("4. product.read absent denies Product query", async () => {
    await expect(listProducts(deniedCtx, executor, {})).rejects.toThrow(CatalogError);
    await expect(getProductDetail(deniedCtx, executor, pId)).rejects.toThrow(CatalogError);
    await expect(listCategories(deniedCtx, executor)).rejects.toThrow(CatalogError);
    await expect(listBrands(deniedCtx, executor)).rejects.toThrow(CatalogError);
  });

  it("5. POS workspace permission without product.read succeeds and exact safe shape", async () => {
    // Note: posCtx does NOT have product.read, it only has workspace.pos.access
    const serverTime = "2026-08-17T00:00:00.000Z";
    const res = await buildPosCatalogBootstrapProjection(posCtx, executor, serverTime);

    expect(res.products).toHaveLength(1);
    
    const expectedProductKeys = [
      "id", "sku", "name", "base_unit_code", "track_inventory", "status", "version", "updated_at"
    ];
    const p = res.products[0];
    expect(p).toBeDefined();
    if (!p) throw new Error("Missing product");
    expect(Object.keys(p).sort()).toEqual(expectedProductKeys.sort());

    const u = res.product_units[0];
    expect(u).toBeDefined();
    if (!u) throw new Error("Missing unit");

    const b = res.barcodes[0];
    expect(b).toBeDefined();
    if (!b) throw new Error("Missing barcode");

    // Proof conversions remain intact
    expect(typeof u.conversion_factor).toBe("string");
    expect(typeof b.barcode).toBe("string");
  });

  it("6. another Business remains isolated", async () => {
    const bId2Ctx = { business_id: "non-existent", user_id: randomUUID(), permissions: new Set(["product.read"]) };
    
    const res = await listProducts(bId2Ctx, executor, {});
    expect(res.items).toHaveLength(0);
    
    await expect(getProductDetail(bId2Ctx, executor, pId)).rejects.toThrow(CatalogError);
  });
});
