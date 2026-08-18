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

describeWithPostgres("M7: Pricing Schema", () => {
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
    if (!result.success) {
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

  it("can insert pricing rules and versions", async () => {
    if (client === undefined) throw new Error("client is not initialized.");
    
    const marginRuleId = randomUUID();
    const priceSetId = randomUUID();
    const proposalId = randomUUID();
    const priceVersionId = randomUUID();

    await client.query(`
      INSERT INTO pricing.margin_rules (
        id, business_id, scope_type, category_id, target_margin, minimum_margin, rounding_rule, status, created_at, updated_at, version
      )
      VALUES (
        $1, $2, 'CATEGORY', $3, 0.20, 0.10, 'NEAREST_100', 'ACTIVE', NOW(), NOW(), 1
      )
    `, [marginRuleId, businessId, categoryId]);

    await client.query(`
      INSERT INTO pricing.price_sets (
        id, business_id, name, source_type, status, created_at, updated_at, version
      )
      VALUES (
        $1, $2, 'Test Set', 'MANUAL', 'ACTIVE', NOW(), NOW(), 1
      )
    `, [priceSetId, businessId]);

    await client.query(`
      INSERT INTO pricing.price_proposal_items (
        id, price_set_id, product_unit_id, proposed_price, risk_level, item_status
      )
      VALUES (
        $1, $2, $3, 100, 'LOW', 'APPROVED'
      )
    `, [proposalId, priceSetId, productUnitId]);

    await client.query(`
      INSERT INTO pricing.price_versions (
        id, business_id, product_unit_id, price_set_id, status, effective_from, tax_mode, tax_rate_snapshot, created_by, created_at
      )
      VALUES (
        $1, $2, $3, $4, 'ACTIVE', NOW(), 'TAX_INCLUSIVE', 0.11, $2, NOW()
      )
    `, [priceVersionId, businessId, productUnitId, priceSetId]);

    const tierRes = await client.query(`
      INSERT INTO pricing.price_tier_versions (
        id, price_version_id, tier_code, min_qty, unit_price, sort_order
      )
      VALUES (
        $1, $2, 'RETAIL', 1, 100, 0
      )
      RETURNING *
    `, [randomUUID(), priceVersionId]);

    expect(tierRes.rowCount).toBe(1);
  });
});
