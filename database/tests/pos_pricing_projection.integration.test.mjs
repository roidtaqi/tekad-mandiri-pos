import { test, expect, beforeAll, afterAll, describe } from "vitest";
import { Client } from "pg";
import { applyMigrations } from "../scripts/migrations.mjs";
import crypto from "node:crypto";
import { buildPosPublishedRetailPriceBootstrapProjection } from "../../packages/domain/src/pricing/queries.js";

const configuredAdminUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = configuredAdminUrl === undefined ? describe.skip : describe;

describeWithPostgres("POS pricing projection integration", () => {
  /** @type {Client} */
  let client;
  /** @type {Client} */
  let adminClient;
  /** @type {string} */
  let childDatabaseName;
  /** @type {any} */
  let bIdA;
  /** @type {any} */
  let bIdB;
  /** @type {any} */
  let puIdA;
  /** @type {any} */
  let puIdB;

  beforeAll(async () => {
    adminClient = new Client({ connectionString: configuredAdminUrl });
    await adminClient.connect();
    
    childDatabaseName = "test_pos_pricing_proj_" + crypto.randomUUID().split("-")[0];
    await adminClient.query(`CREATE DATABASE ${childDatabaseName}`);
    
    const urlObj = new URL(configuredAdminUrl || "");
    urlObj.pathname = "/" + childDatabaseName;
    client = new Client({ connectionString: urlObj.toString() });
    await client.connect();

    await applyMigrations({ databaseUrl: urlObj.toString() });
    
    bIdA = crypto.randomUUID();
    bIdB = crypto.randomUUID();
    puIdA = crypto.randomUUID();
    puIdB = crypto.randomUUID();
    const cIdA = crypto.randomUUID();
    const cIdB = crypto.randomUUID();
    const pIdA = crypto.randomUUID();
    const pIdB = crypto.randomUUID();

    await client.query(`
      INSERT INTO core.businesses (id, name, currency_code, timezone, status)
      VALUES 
        ($1, 'Business A', 'IDR', 'Asia/Jakarta', 'ACTIVE'),
        ($2, 'Business B', 'IDR', 'Asia/Jakarta', 'ACTIVE')
    `, [bIdA, bIdB]);

    await client.query(`
      INSERT INTO catalog.categories (id, business_id, name, status)
      VALUES 
        ($1, $2, 'Category A', 'ACTIVE'),
        ($3, $4, 'Category B', 'ACTIVE')
    `, [cIdA, bIdA, cIdB, bIdB]);

    await client.query(`
      INSERT INTO catalog.products (id, business_id, category_id, sku, name, base_unit_code, track_inventory, status)
      VALUES 
        ($1, $2, $3, 'SKUA', 'Product A', 'PCS', false, 'ACTIVE'),
        ($4, $5, $6, 'SKUB', 'Product B', 'PCS', false, 'ACTIVE')
    `, [pIdA, bIdA, cIdA, pIdB, bIdB, cIdB]);

    await client.query(`
      INSERT INTO catalog.product_units (id, business_id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status)
      VALUES 
        ($1, $2, $3, 'PCS', 'Pieces A', 1, true, true, false, 'ACTIVE'),
        ($4, $5, $6, 'PCS', 'Pieces B', 1, true, true, false, 'ACTIVE')
    `, [puIdA, bIdA, pIdA, puIdB, bIdB, pIdB]);
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

  test("Business A / B projection tests", async () => {
    /** @type {import("../../packages/domain/src/core/context.js").SqlExecutor} */
    const executor = { query: async (sql, params) => (/** @type {any} */ (await client.query(sql, params))) };
    const serverTime = '2030-01-01T12:00:00Z';

    const pvActiveA = crypto.randomUUID();
    await client.query(`INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from) VALUES ($1, $2, $3, 'ACTIVE', '2030-01-01T00:00:00Z')`, [pvActiveA, bIdA, puIdA]);
    await client.query(`INSERT INTO pricing.price_tier_versions (id, price_version_id, tier_code, min_qty, unit_price, sort_order) VALUES ($1, $2, 'RETAIL', 1, 3500.0000, 1)`, [crypto.randomUUID(), pvActiveA]);

    /** @type {import("../../packages/domain/src/core/context.js").ActorContext} */
    const ctxA = {
      business_id: bIdA,
      user_id: "u1",
      permissions: new Set(["workspace.pos.access"])
    };

    const resA = await buildPosPublishedRetailPriceBootstrapProjection(ctxA, executor, serverTime);
    expect(resA.business_id).toBe(bIdA);
    expect(resA.server_time).toBe(serverTime);
    expect(resA.prices.length).toBe(1);
    expect(resA.prices[0]?.price_version_id).toBe(pvActiveA);
    expect(resA.prices[0]?.product_unit_id).toBe(puIdA);
    expect(resA.prices[0]?.unit_price).toBe("3500.0000"); // exact string
    expect(resA.prices[0]?.effective_to).toBeNull();

    /** @type {import("../../packages/domain/src/core/context.js").ActorContext} */
    const ctxNoAccess = {
      business_id: bIdA,
      user_id: "u1",
      permissions: new Set(["pricing.read"])
    };
    await expect(buildPosPublishedRetailPriceBootstrapProjection(ctxNoAccess, executor, serverTime)).rejects.toThrow("PRICING_PERMISSION_DENIED");

    /** @type {any} */
    const ctxOwner = {
      business_id: bIdA,
      primary_role: "OWNER",
      permissions: new Set([])
    };
    await expect(buildPosPublishedRetailPriceBootstrapProjection(ctxOwner, executor, serverTime)).rejects.toThrow();

    const pvActiveB = crypto.randomUUID();
    await client.query(`INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from) VALUES ($1, $2, $3, 'ACTIVE', '2030-01-01T00:00:00Z')`, [pvActiveB, bIdB, puIdB]);
    await client.query(`INSERT INTO pricing.price_tier_versions (id, price_version_id, tier_code, min_qty, unit_price, sort_order) VALUES ($1, $2, 'RETAIL', 1, 4000.0000, 1)`, [crypto.randomUUID(), pvActiveB]);
    
    /** @type {import("../../packages/domain/src/core/context.js").ActorContext} */
    const ctxB = {
      business_id: bIdB,
      user_id: "u2",
      permissions: new Set(["workspace.pos.access"])
    };
    const resB = await buildPosPublishedRetailPriceBootstrapProjection(ctxB, executor, serverTime);
    expect(resB.prices.length).toBe(1);
    expect(resB.prices[0]?.product_unit_id).toBe(puIdB);
  });

  test("Filtering tests", async () => {
    /** @type {import("../../packages/domain/src/core/context.js").SqlExecutor} */
    const executor = { query: async (sql, params) => (/** @type {any} */ (await client.query(sql, params))) };
    const serverTime = '2030-01-01T12:00:00Z';
    const bId = crypto.randomUUID();
    const cId = crypto.randomUUID();
    const pId = crypto.randomUUID();

    await client.query(`INSERT INTO core.businesses (id, name, currency_code, timezone, status) VALUES ($1, 'Business Filter', 'IDR', 'Asia/Jakarta', 'ACTIVE')`, [bId]);
    await client.query(`INSERT INTO catalog.categories (id, business_id, name, status) VALUES ($1, $2, 'Category F', 'ACTIVE')`, [cId, bId]);
    await client.query(`INSERT INTO catalog.products (id, business_id, category_id, sku, name, base_unit_code, track_inventory, status) VALUES ($1, $2, $3, 'SKUF', 'Product F', 'PCS', false, 'ACTIVE')`, [pId, bId, cId]);

    /** @type {import("../../packages/domain/src/core/context.js").ActorContext} */
    const ctx = {
      business_id: bId,
      user_id: "u3",
      permissions: new Set(["workspace.pos.access"])
    };

    const runWithSinglePrice = async (/** @type {any} */ status, /** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ tier, /** @type {any} */ minQty) => {
      const puId = crypto.randomUUID();
      await client.query(`INSERT INTO catalog.product_units (id, business_id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status) VALUES ($1, $2, $3, 'PCS', 'Pieces F', 1, true, true, false, 'ACTIVE')`, [puId, bId, pId]);
      
      const pvId = crypto.randomUUID();
      await client.query(`INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from, effective_to) VALUES ($1, $2, $3, $4, $5, $6)`, [pvId, bId, puId, status, from, to]);
      await client.query(`INSERT INTO pricing.price_tier_versions (id, price_version_id, tier_code, min_qty, unit_price, sort_order) VALUES ($1, $2, $3, $4, 100, 1)`, [crypto.randomUUID(), pvId, tier, minQty]);

      const res = await buildPosPublishedRetailPriceBootstrapProjection(ctx, executor, serverTime);
      const row = res.prices.find((/** @type {any} */ p) => p.product_unit_id === puId);
      return row ? true : false;
    };

    // I. SCHEDULED excluded
    expect(await runWithSinglePrice('SCHEDULED', '2029-01-01T00:00:00Z', null, 'RETAIL', 1)).toBe(false);
    
    // J. SUPERSEDED excluded
    expect(await runWithSinglePrice('SUPERSEDED', '2029-01-01T00:00:00Z', null, 'RETAIL', 1)).toBe(false);
    
    // K. CANCELLED excluded
    expect(await runWithSinglePrice('CANCELLED', '2029-01-01T00:00:00Z', null, 'RETAIL', 1)).toBe(false);
    
    // L. ACTIVE with future effective_from excluded
    expect(await runWithSinglePrice('ACTIVE', '2030-01-02T00:00:00Z', null, 'RETAIL', 1)).toBe(false);
    
    // M. ACTIVE with expired effective_to excluded
    expect(await runWithSinglePrice('ACTIVE', '2029-01-01T00:00:00Z', '2029-12-31T00:00:00Z', 'RETAIL', 1)).toBe(false);
    
    // O. WHOLESALE/non-RETAIL tier ignored
    expect(await runWithSinglePrice('ACTIVE', '2029-01-01T00:00:00Z', null, 'WHOLESALE', 1)).toBe(false);
    
    // non-1 qty ignored
    expect(await runWithSinglePrice('ACTIVE', '2029-01-01T00:00:00Z', null, 'RETAIL', 10)).toBe(false);
    
    // Baseline valid included
    expect(await runWithSinglePrice('ACTIVE', '2029-01-01T00:00:00Z', null, 'RETAIL', 1)).toBe(true);
  });
});
