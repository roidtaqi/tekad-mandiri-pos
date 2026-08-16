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
  });

  it("1. builds correct bootstrap snapshot", async () => {
    const snap = await buildPosCatalogBootstrapProjection(posCtx, executor, serverTime);

    expect(snap.bootstrap_version).toBe(1);
    expect(snap.business_id).toBe(bId);
    expect(snap.server_time).toBe(serverTime);

    // Products
    expect(snap.products).toHaveLength(1);
    expect(snap.products[0].sku).toBe("SKU-1");
    expect(snap.products[0]).not.toHaveProperty("category_id"); // Ensures extra fields are dropped
    expect(snap.products[0]).not.toHaveProperty("cost");
    expect(snap.products[0]).not.toHaveProperty("stock");

    // Product Units
    expect(snap.product_units).toHaveLength(1);
    expect(snap.product_units[0].conversion_factor).toBe("1.00000000"); // Postgres NUMERIC mapping creates string
    expect(typeof snap.product_units[0].conversion_factor).toBe("string");

    // Barcodes
    expect(snap.barcodes).toHaveLength(1);
    expect(snap.barcodes[0].barcode).toBe("00123");
    expect(typeof snap.barcodes[0].barcode).toBe("string");
  });

  it("2. scopes to business_id", async () => {
    const snap = await buildPosCatalogBootstrapProjection(wrongTenantCtx, executor, serverTime);
    expect(snap.business_id).toBe(wrongTenantCtx.business_id);
    expect(snap.products).toHaveLength(1);
    expect(snap.products[0].sku).toBe("SKU-B2");
    expect(snap.product_units).toHaveLength(0);
    expect(snap.barcodes).toHaveLength(0);
  });

  it("3. requires workspace.pos.access", async () => {
    await expect(buildPosCatalogBootstrapProjection(noPermCtx, executor, serverTime)).rejects.toThrowError(CatalogError);
  });
});
