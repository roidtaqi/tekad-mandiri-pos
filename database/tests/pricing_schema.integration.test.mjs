import { test, expect, beforeAll, afterAll, describe } from "vitest";
import { Client } from "pg";
import { applyMigrations } from "../scripts/migrations.mjs";

const configuredAdminUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = configuredAdminUrl === undefined ? describe.skip : describe;

describeWithPostgres("pricing schema integration", () => {
  /** @type {Client} */
  let client;
  /** @type {Client} */
  let adminClient;
  /** @type {string} */
  let childDatabaseName;
  /** @type {any} */
  let bId;
  /** @type {any} */
  let cId;
  /** @type {any} */
  let pId;
  /** @type {any} */
  let puId;
  /** @type {any} */
  let pvId;
  /** @type {any} */
  let ptId;

  beforeAll(async () => {
    adminClient = new Client({ connectionString: configuredAdminUrl });
    await adminClient.connect();
    
    childDatabaseName = "test_pricing_schema_" + crypto.randomUUID().split("-")[0];
    await adminClient.query(`CREATE DATABASE ${childDatabaseName}`);
    
    const urlObj = new URL(configuredAdminUrl || "");
    urlObj.pathname = "/" + childDatabaseName;
    client = new Client({ connectionString: urlObj.toString() });
    await client.connect();

    await applyMigrations({ databaseUrl: urlObj.toString() });
    
    bId = crypto.randomUUID();
    cId = crypto.randomUUID();
    pId = crypto.randomUUID();
    puId = crypto.randomUUID();
    pvId = crypto.randomUUID();
    ptId = crypto.randomUUID();

    await client.query(`
      INSERT INTO core.businesses (id, name, type, currency_code, timezone, status)
      VALUES ($1, 'Test Business', 'RETAIL', 'IDR', 'Asia/Jakarta', 'ACTIVE')
    `, [bId]);

    await client.query(`
      INSERT INTO catalog.categories (id, business_id, name, is_active)
      VALUES ($1, $2, 'Test Category', true)
    `, [cId, bId]);

    await client.query(`
      INSERT INTO catalog.products (id, business_id, category_id, sku, name, base_unit_code, track_inventory, status)
      VALUES ($1, $2, $3, 'SKU1', 'Test Product', 'PCS', false, 'ACTIVE')
    `, [pId, bId, cId]);

    await client.query(`
      INSERT INTO catalog.product_units (id, business_id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status)
      VALUES ($1, $2, $3, 'PCS', 'Pieces', 1, true, true, false, 'ACTIVE')
    `, [puId, bId, pId]);
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

  test("A. migration 000007 appears after 000006", async () => {
    const res = await client.query(`SELECT filename FROM public.kastur_schema_migrations ORDER BY version ASC`);
    const filenames = res.rows.map((/** @type {any} */ r) => r.filename);
    const idx6 = filenames.indexOf("000006_create_product_units_barcodes.sql");
    const idx7 = filenames.indexOf("000007_create_minimal_published_retail_pricing.sql");
    expect(idx6).toBeGreaterThan(-1);
    expect(idx7).toBeGreaterThan(idx6);
  });

  test("B. pricing schema exists", async () => {
    const res = await client.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'pricing'`);
    expect(res.rows.length).toBe(1);
  });

  test("C. exact price_versions columns/types", async () => {
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'pricing' AND table_name = 'price_versions'
      ORDER BY column_name ASC
    `);
    expect(res.rows).toEqual(expect.arrayContaining([
      { column_name: "business_id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "NO" },
      { column_name: "effective_from", data_type: "timestamp with time zone", is_nullable: "NO" },
      { column_name: "effective_to", data_type: "timestamp with time zone", is_nullable: "YES" },
      { column_name: "id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "product_unit_id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "status", data_type: "text", is_nullable: "NO" }
    ]));
  });

  test("D. exact price_tier_versions columns/types", async () => {
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'pricing' AND table_name = 'price_tier_versions'
      ORDER BY column_name ASC
    `);
    expect(res.rows).toEqual(expect.arrayContaining([
      { column_name: "id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "min_qty", data_type: "numeric", is_nullable: "NO" },
      { column_name: "price_version_id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "sort_order", data_type: "integer", is_nullable: "NO" },
      { column_name: "tier_code", data_type: "text", is_nullable: "NO" },
      { column_name: "unit_price", data_type: "numeric", is_nullable: "NO" }
    ]));
  });

  test("E. same-Business ProductUnit FK succeeds", async () => {
    await expect(
      client.query(`
        INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from)
        VALUES ($1, $2, $3, 'ACTIVE', now())
      `, [pvId, bId, puId])
    ).resolves.not.toThrow();
  });

  test("F. cross-Business ProductUnit FK fails", async () => {
    const bId2 = crypto.randomUUID();
    await client.query(`
      INSERT INTO core.businesses (id, name, type, currency_code, timezone, status)
      VALUES ($1, 'Test Business 2', 'RETAIL', 'IDR', 'Asia/Jakarta', 'ACTIVE')
    `, [bId2]);
    const pvId2 = crypto.randomUUID();
    await expect(
      client.query(`
        INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from)
        VALUES ($1, $2, $3, 'ACTIVE', now())
      `, [pvId2, bId2, puId])
    ).rejects.toThrow();
  });

  test("G. invalid PriceVersion status fails", async () => {
    const pvIdInvalid = crypto.randomUUID();
    await expect(
      client.query(`
        INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from)
        VALUES ($1, $2, $3, 'INVALID', now())
      `, [pvIdInvalid, bId, puId])
    ).rejects.toThrow();
  });

  test("H. effective_to = effective_from fails", async () => {
    const pvIdErr = crypto.randomUUID();
    await expect(
      client.query(`
        INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from, effective_to)
        VALUES ($1, $2, $3, 'SCHEDULED', '2030-01-01T00:00:00Z', '2030-01-01T00:00:00Z')
      `, [pvIdErr, bId, puId])
    ).rejects.toThrow();
  });

  test("I. effective_to < effective_from fails", async () => {
    const pvIdErr = crypto.randomUUID();
    await expect(
      client.query(`
        INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from, effective_to)
        VALUES ($1, $2, $3, 'SCHEDULED', '2030-01-02T00:00:00Z', '2030-01-01T00:00:00Z')
      `, [pvIdErr, bId, puId])
    ).rejects.toThrow();
  });

  test("J. second ACTIVE version for same business_id + product_unit_id fails", async () => {
    const pvId2 = crypto.randomUUID();
    await expect(
      client.query(`
        INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from)
        VALUES ($1, $2, $3, 'ACTIVE', now())
      `, [pvId2, bId, puId])
    ).rejects.toThrow();
  });

  test("K. ACTIVE + SCHEDULED coexist", async () => {
    const pvIdSched = crypto.randomUUID();
    await expect(
      client.query(`
        INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from)
        VALUES ($1, $2, $3, 'SCHEDULED', '2040-01-01T00:00:00Z')
      `, [pvIdSched, bId, puId])
    ).resolves.not.toThrow();
  });

  test("L. multiple SUPERSEDED historical rows coexist", async () => {
    const pvIdSup1 = crypto.randomUUID();
    const pvIdSup2 = crypto.randomUUID();
    await client.query(`
      INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from)
      VALUES ($1, $2, $3, 'SUPERSEDED', '2020-01-01T00:00:00Z')
    `, [pvIdSup1, bId, puId]);
    await expect(
      client.query(`
        INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from)
        VALUES ($1, $2, $3, 'SUPERSEDED', '2021-01-01T00:00:00Z')
      `, [pvIdSup2, bId, puId])
    ).resolves.not.toThrow();
  });

  test("M. duplicate tier_code within one version fails", async () => {
    await client.query(`
      INSERT INTO pricing.price_tier_versions (id, price_version_id, tier_code, min_qty, unit_price, sort_order)
      VALUES ($1, $2, 'RETAIL', 1, 3500.0000, 1)
    `, [ptId, pvId]);

    const ptId2 = crypto.randomUUID();
    await expect(
      client.query(`
        INSERT INTO pricing.price_tier_versions (id, price_version_id, tier_code, min_qty, unit_price, sort_order)
        VALUES ($1, $2, 'RETAIL', 2, 3000.0000, 2)
      `, [ptId2, pvId])
    ).rejects.toThrow();
  });

  test("N. duplicate min_qty within one version fails", async () => {
    const ptId3 = crypto.randomUUID();
    await expect(
      client.query(`
        INSERT INTO pricing.price_tier_versions (id, price_version_id, tier_code, min_qty, unit_price, sort_order)
        VALUES ($1, $2, 'WHOLESALE', 1, 3000.0000, 2)
      `, [ptId3, pvId])
    ).rejects.toThrow();
  });

  test("O. min_qty = 0 fails", async () => {
    const pvIdNew = crypto.randomUUID();
    await client.query(`
      INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from)
      VALUES ($1, $2, $3, 'CANCELLED', now())
    `, [pvIdNew, bId, puId]);
    
    const ptIdNew = crypto.randomUUID();
    await expect(
      client.query(`
        INSERT INTO pricing.price_tier_versions (id, price_version_id, tier_code, min_qty, unit_price, sort_order)
        VALUES ($1, $2, 'RETAIL', 0, 3500.0000, 1)
      `, [ptIdNew, pvIdNew])
    ).rejects.toThrow();
  });

  test("P. min_qty < 0 fails", async () => {
    const ptIdNew = crypto.randomUUID();
    await expect(
      client.query(`
        INSERT INTO pricing.price_tier_versions (id, price_version_id, tier_code, min_qty, unit_price, sort_order)
        VALUES ($1, $2, 'RETAIL', -1, 3500.0000, 1)
      `, [ptIdNew, pvId])
    ).rejects.toThrow();
  });

  test("Q. negative unit_price fails", async () => {
    const pvIdNew = crypto.randomUUID();
    await client.query(`
      INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from)
      VALUES ($1, $2, $3, 'CANCELLED', now())
    `, [pvIdNew, bId, puId]);
    
    const ptIdNew = crypto.randomUUID();
    await expect(
      client.query(`
        INSERT INTO pricing.price_tier_versions (id, price_version_id, tier_code, min_qty, unit_price, sort_order)
        VALUES ($1, $2, 'RETAIL', 1, -100, 1)
      `, [ptIdNew, pvIdNew])
    ).rejects.toThrow();
  });

  test("R. zero unit_price succeeds", async () => {
    const pvIdNew = crypto.randomUUID();
    await client.query(`
      INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from)
      VALUES ($1, $2, $3, 'CANCELLED', now())
    `, [pvIdNew, bId, puId]);
    
    const ptIdNew = crypto.randomUUID();
    await expect(
      client.query(`
        INSERT INTO pricing.price_tier_versions (id, price_version_id, tier_code, min_qty, unit_price, sort_order)
        VALUES ($1, $2, 'RETAIL', 1, 0, 1)
      `, [ptIdNew, pvIdNew])
    ).resolves.not.toThrow();
  });

  test("S. NUMERIC(20,4) price is returned through pg as decimal-safe text", async () => {
    const res = await client.query(`SELECT unit_price FROM pricing.price_tier_versions WHERE id = $1`, [ptId]);
    expect(typeof res.rows[0].unit_price).toBe("string");
    expect(res.rows[0].unit_price).toBe("3500.0000");
  });

  test("T. ProductUnit delete restriction remains appropriate while price history references it", async () => {
    await expect(
      client.query(`DELETE FROM catalog.product_units WHERE id = $1`, [puId])
    ).rejects.toThrow();
  });
});
