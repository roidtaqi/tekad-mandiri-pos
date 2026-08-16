// @ts-check

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../scripts/migrations.mjs";
import { createProduct, listProducts, getProductDetail } from "@kastur/domain";
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

describeWithPostgres("Catalog Application Integration", () => {
  beforeAll(async () => {
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.href });
    await adminClient.connect();

    childDatabaseName = `kastur_ci_test_catalog_${Date.now()}_${randomUUID().replace(/-/g, "").substring(0, 8)}`;

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

  /** @type {import("@kastur/domain").ActorContext} */
  const ownerCtx = { business_id: bId, user_id: randomUUID(), permissions: new Set(["product.create", "product.read"]) };
  
  /** @type {import("@kastur/domain").ActorContext} */
  const readCtx = { business_id: bId, user_id: randomUUID(), permissions: new Set(["product.read"]) };


  /** @type {import("@kastur/domain").ActorContext} */
  const wrongTenantCtx = { business_id: randomUUID(), user_id: randomUUID(), permissions: new Set(["product.create", "product.read"]) };

  /** @type {import("@kastur/domain").SqlExecutor} */
  const executor = {
    // @ts-ignore
    query: async (text, params) => {
      if (!client) throw new Error("Client not connected");
      return client.query(text, params);
    }
  };

  it("0. Prepares valid business, category, and brand", async () => {
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'B1', 'IDR', 'UTC', 'ACTIVE')`, [bId]);
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Cat1', 'ACTIVE')`, [cId, bId]);
    await client?.query(`INSERT INTO catalog.brands (id, business_id, name, status) VALUES ($1, $2, 'Brand1', 'ACTIVE')`, [brandId, bId]);
  });

  it("1. createProduct happy path creates ACTIVE Product with correct fields", async () => {
    const pId = randomUUID();
    const result = await createProduct(ownerCtx, executor, {
      product_id: pId,
      sku: "SKU1",
      name: "Product 1",
      category_id: cId,
      brand_id: null,
      base_unit_code: "PCS",
      track_inventory: true
    });

    expect(result.product_id).toBe(pId);
    expect(result.version).toBe("1");

    const row = (await client?.query(`SELECT * FROM catalog.products WHERE id = $1`, [pId]))?.rows[0];
    expect(row.business_id).toBe(bId);
    expect(row.sku).toBe("SKU1");
    expect(row.name).toBe("Product 1");
    expect(row.status).toBe("ACTIVE");
    expect(row.base_unit_code).toBe("PCS");
  });

  it("2. product.create required", async () => {
    await expect(createProduct(readCtx, executor, {
      product_id: randomUUID(),
      sku: "S2",
      name: "P2",
      category_id: cId,
      brand_id: null,
      base_unit_code: "PCS",
      track_inventory: false
    })).rejects.toThrowError(CatalogError);

    // E. OWNER role name alone without product.create is denied
    const fakeOwnerCtx = { business_id: bId, user_id: randomUUID(), permissions: new Set(["not.product.create"]), role: "OWNER" };
    // @ts-ignore
    await expect(createProduct(fakeOwnerCtx, executor, {
      product_id: randomUUID(),
      sku: "S2",
      name: "P2",
      category_id: cId,
      brand_id: null,
      base_unit_code: "PCS",
      track_inventory: false
    })).rejects.toThrowError(CatalogError);
  });

  it("3. duplicate SKU maps to SKU_ALREADY_EXISTS", async () => {
    await expect(createProduct(ownerCtx, executor, {
      product_id: randomUUID(),
      sku: "SKU1",
      name: "Product 2",
      category_id: cId,
      brand_id: null,
      base_unit_code: "PCS",
      track_inventory: true
    })).rejects.toMatchObject({ code: "SKU_ALREADY_EXISTS" });
  });

  it("4. Category from another Business rejected", async () => {
    const bId2 = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'B2', 'IDR', 'UTC', 'ACTIVE')`, [bId2]);
    const cId2 = randomUUID();
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Cat2', 'ACTIVE')`, [cId2, bId2]);

    await expect(createProduct(ownerCtx, executor, {
      product_id: randomUUID(),
      sku: "SKU3",
      name: "P3",
      category_id: cId2,
      brand_id: null,
      base_unit_code: "PCS",
      track_inventory: false
    })).rejects.toMatchObject({ code: "ENTITY_NOT_FOUND" });
  });

  it("5. Brand from another Business rejected", async () => {
    const bId2 = randomUUID();
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'B3', 'IDR', 'UTC', 'ACTIVE') ON CONFLICT DO NOTHING`, [bId2]);
    const brandId2 = randomUUID();
    await client?.query(`INSERT INTO catalog.brands (id, business_id, name, status) VALUES ($1, $2, 'Brand2', 'ACTIVE')`, [brandId2, bId2]);

    await expect(createProduct(ownerCtx, executor, {
      product_id: randomUUID(),
      sku: "SKU4",
      name: "P4",
      category_id: cId,
      brand_id: brandId2,
      base_unit_code: "PCS",
      track_inventory: false
    })).rejects.toMatchObject({ code: "ENTITY_NOT_FOUND" });
  });

  it("6. listProducts filters and search works", async () => {
    await createProduct(ownerCtx, executor, {
      product_id: randomUUID(),
      sku: "BARC-TEST",
      name: "My Special Product",
      category_id: cId,
      brand_id: brandId,
      base_unit_code: "BOX",
      track_inventory: true
    });

    const res1 = await listProducts(ownerCtx, executor, { q: "Special" });
    const item0 = res1.items[0];
    if (!item0) throw new Error("Expected item");
    expect(item0.name).toBe("My Special Product");
    expect(item0.brand?.id).toBe(brandId);
    expect(item0.category.id).toBe(cId);

    const res2 = await listProducts(ownerCtx, executor, { category_id: cId });
    expect(res2.items.length).toBe(2);

    const res3 = await listProducts(ownerCtx, executor, { track_inventory: false });
    expect(res3.items.length).toBe(0);

    const res4 = await listProducts(wrongTenantCtx, executor, {});
    expect(res4.items.length).toBe(0); // Tenant scoping
  });

  it("7. getProductDetail works with units and barcodes", async () => {
    const pId = randomUUID();
    await createProduct(ownerCtx, executor, {
      product_id: pId,
      sku: "DET-1",
      name: "Detail Product",
      category_id: cId,
      brand_id: null,
      base_unit_code: "PCS",
      track_inventory: false
    });

    const puId = randomUUID();
    await client?.query(`
      INSERT INTO catalog.product_units (id, business_id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status)
      VALUES ($1, $2, $3, 'PCS', 'Pieces', 1, true, true, false, 'ACTIVE')
    `, [puId, bId, pId]);

    const b1Id = randomUUID();
    await client?.query(`
      INSERT INTO catalog.barcodes (id, business_id, product_unit_id, barcode, is_internal, status)
      VALUES ($1, $2, $3, '000123', false, 'ACTIVE')
    `, [b1Id, bId, puId]);

    const detail = await getProductDetail(ownerCtx, executor, pId);
    expect(detail.id).toBe(pId);
    expect(detail.name).toBe("Detail Product");
    expect(detail.units.length).toBe(1);
    const unit0 = detail.units[0];
    if (!unit0) throw new Error("Expected unit");
    expect(unit0.conversion_factor).toBe("1.00000000"); // String
    expect(unit0.barcodes.length).toBe(1);
    const bc0 = unit0.barcodes[0];
    if (!bc0) throw new Error("Expected barcode");
    expect(bc0.barcode).toBe("000123"); // Leading zero retained

    await expect(getProductDetail(wrongTenantCtx, executor, pId)).rejects.toMatchObject({ code: "ENTITY_NOT_FOUND" });
  });
});
