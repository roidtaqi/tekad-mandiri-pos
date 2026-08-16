// @ts-check

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../scripts/migrations.mjs";
import { buildPosCatalogBootstrapProjection } from "@kastur/domain";
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

describeWithPostgres("POS Catalog Bootstrap Projection Integration", () => {
  beforeAll(async () => {
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.href });
    await adminClient.connect();

    childDatabaseName = `kastur_ci_test_bootstrap_${Date.now()}_${randomUUID().replace(/-/g, "").substring(0, 8)}`;

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

  /** @type {import("@kastur/domain").ActorContext} */
  const posCtx = { business_id: bId, user_id: randomUUID(), permissions: new Set(["workspace.pos.access"]) };
  
  /** @type {import("@kastur/domain").ActorContext} */
  const noPermCtx = { business_id: bId, user_id: randomUUID(), permissions: new Set(["product.read"]) };

  /** @type {import("@kastur/domain").ActorContext} */
  const wrongTenantCtx = { business_id: randomUUID(), user_id: randomUUID(), permissions: new Set(["workspace.pos.access"]) };

  /** @type {import("@kastur/domain").SqlExecutor} */
  const executor = {
    // @ts-ignore
    query: async (text, params) => {
      if (!client) throw new Error("Client not connected");
      return client.query(text, params);
    }
  };

  const serverTime = "2026-08-17T00:00:00.000Z";

  it("0. Prepares valid business, category, product, unit, and barcode", async () => {
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'B1', 'IDR', 'UTC', 'ACTIVE')`, [bId]);
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Cat1', 'ACTIVE')`, [cId, bId]);

    const pId1 = "00000000-0000-0000-0000-000000000001";
    await client?.query(`
      INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
      VALUES ($1, $2, 'SKU-1', 'Product 1', $3, 'PCS', true, 'ACTIVE')
    `, [pId1, bId, cId]);

    const puId1 = "00000000-0000-0000-0000-000000000002";
    await client?.query(`
      INSERT INTO catalog.product_units (id, business_id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status)
      VALUES ($1, $2, $3, 'PCS', 'Pieces', 1, true, true, false, 'ACTIVE')
    `, [puId1, bId, pId1]);

    const bId1 = "00000000-0000-0000-0000-000000000003";
    await client?.query(`
      INSERT INTO catalog.barcodes (id, business_id, product_unit_id, barcode, is_internal, status)
      VALUES ($1, $2, $3, '00123', false, 'ACTIVE')
    `, [bId1, bId, puId1]);
    
    // Inactive elements for B1
    const pIdInactive = "00000000-0000-0000-0000-000000000005";
    await client?.query(`
      INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
      VALUES ($1, $2, 'SKU-2', 'Product Inactive', $3, 'BOX', true, 'INACTIVE')
    `, [pIdInactive, bId, cId]);

    const puIdInactive = "00000000-0000-0000-0000-000000000006";
    await client?.query(`
      INSERT INTO catalog.product_units (id, business_id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status)
      VALUES ($1, $2, $3, 'BOX', 'Boxes', 10, true, true, false, 'INACTIVE')
    `, [puIdInactive, bId, pIdInactive]);

    const bIdInactive = "00000000-0000-0000-0000-000000000007";
    await client?.query(`
      INSERT INTO catalog.barcodes (id, business_id, product_unit_id, barcode, is_internal, status)
      VALUES ($1, $2, $3, 'INACTIVE-BC', false, 'INACTIVE')
    `, [bIdInactive, bId, puIdInactive]);

    // Setup another business to verify scoping
    const bId2 = wrongTenantCtx.business_id;
    await client?.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'B2', 'IDR', 'UTC', 'ACTIVE')`, [bId2]);
    const cId2 = randomUUID();
    await client?.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Cat2', 'ACTIVE')`, [cId2, bId2]);
    const pId2 = "00000000-0000-0000-0000-000000000004";
    await client?.query(`
      INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
      VALUES ($1, $2, 'SKU-B2', 'Product B2', $3, 'BOX', false, 'INACTIVE')
    `, [pId2, bId2, cId2]);

    const puId2 = "00000000-0000-0000-0000-000000000008";
    await client?.query(`
      INSERT INTO catalog.product_units (id, business_id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status)
      VALUES ($1, $2, $3, 'BOX', 'Boxes B2', 1, true, true, false, 'ACTIVE')
    `, [puId2, bId2, pId2]);

    const bcId2 = "00000000-0000-0000-0000-000000000009";
    await client?.query(`
      INSERT INTO catalog.barcodes (id, business_id, product_unit_id, barcode, is_internal, status)
      VALUES ($1, $2, $3, '111-B2', false, 'ACTIVE')
    `, [bcId2, bId2, puId2]);
  });

  it("1. builds correct bootstrap snapshot preserving ACTIVE/INACTIVE", async () => {
    // We intentionally test with posCtx (which lacks product.read) to prove it succeeds without it.
    const snap = await buildPosCatalogBootstrapProjection(posCtx, executor, serverTime);

    expect(snap.bootstrap_version).toBe(1);
    expect(snap.business_id).toBe(bId);
    expect(snap.server_time).toBe(serverTime);

    // Products (ordered by ID ASC in projection)
    expect(snap.products).toHaveLength(2);
    const p1 = snap.products[0];
    const p2 = snap.products[1];
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    if (!p1 || !p2) throw new Error("Missing product");

    expect(p1.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(p1.sku).toBe("SKU-1");
    expect(p1.status).toBe("ACTIVE");
    expect(typeof p1.version).toBe("string");
    expect(typeof p1.updated_at).toBe("string");
    
    // Explicitly check properties don't exist
    expect(p1).not.toHaveProperty("category_id");
    expect(p1).not.toHaveProperty("brand_id");
    expect(p1).not.toHaveProperty("cost");
    expect(p1).not.toHaveProperty("price");
    expect(p1).not.toHaveProperty("margin");
    expect(p1).not.toHaveProperty("stock");
    expect(p1).not.toHaveProperty("supplier");

    expect(p2.id).toBe("00000000-0000-0000-0000-000000000005");
    expect(p2.sku).toBe("SKU-2");
    expect(p2.status).toBe("INACTIVE");

    // Product Units
    expect(snap.product_units).toHaveLength(2);
    const pu1 = snap.product_units[0];
    const pu2 = snap.product_units[1];
    expect(pu1).toBeDefined();
    expect(pu2).toBeDefined();
    if (!pu1 || !pu2) throw new Error("Missing product unit");

    expect(pu1.conversion_factor).toBe("1.00000000"); // Postgres NUMERIC mapping creates string
    expect(typeof pu1.conversion_factor).toBe("string");
    expect(pu1.status).toBe("ACTIVE");
    expect(typeof pu1.updated_at).toBe("string");
    expect(typeof pu1.version).toBe("string");

    expect(pu2.conversion_factor).toBe("10.00000000");
    expect(pu2.status).toBe("INACTIVE");

    // Barcodes
    expect(snap.barcodes).toHaveLength(2);
    const bc1 = snap.barcodes[0];
    const bc2 = snap.barcodes[1];
    expect(bc1).toBeDefined();
    expect(bc2).toBeDefined();
    if (!bc1 || !bc2) throw new Error("Missing barcode");

    expect(bc1.barcode).toBe("00123");
    expect(typeof bc1.barcode).toBe("string");
    expect(bc1.status).toBe("ACTIVE");

    expect(bc2.barcode).toBe("INACTIVE-BC");
    expect(bc2.status).toBe("INACTIVE");
  });

  it("2. scopes to business_id", async () => {
    const snap = await buildPosCatalogBootstrapProjection(wrongTenantCtx, executor, serverTime);
    expect(snap.business_id).toBe(wrongTenantCtx.business_id);
    expect(snap.products).toHaveLength(1);
    
    const p1 = snap.products[0];
    expect(p1).toBeDefined();
    if (!p1) throw new Error("Missing product");
    expect(p1.sku).toBe("SKU-B2");

    expect(snap.product_units).toHaveLength(1);
    const pu1 = snap.product_units[0];
    expect(pu1).toBeDefined();
    if (!pu1) throw new Error("Missing product unit");
    expect(pu1.unit_code).toBe("BOX");

    expect(snap.barcodes).toHaveLength(1);
    const bc1 = snap.barcodes[0];
    expect(bc1).toBeDefined();
    if (!bc1) throw new Error("Missing barcode");
    expect(bc1.barcode).toBe("111-B2");
  });

  it("3. requires workspace.pos.access", async () => {
    await expect(buildPosCatalogBootstrapProjection(noPermCtx, executor, serverTime)).rejects.toThrowError(CatalogError);
  });
});
