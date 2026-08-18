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

describeWithPostgres("M6-001: Costing Schema", () => {
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

    const output = [];
    const pushOutput = (/** @type {string} */ line) => output.push(line);
    const result = await applyMigrations({
      databaseUrl: childDatabaseUrl,
      silent: true,
      writeStdout: pushOutput,
      writeStderr: pushOutput,
    });
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
  const locationId = randomUUID();
  const categoryId = randomUUID();
  const productId = randomUUID();

  beforeAll(async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    await client.query(`
      INSERT INTO core.businesses (id, name, status, created_at, updated_at)
      VALUES ($1, 'Test Business', 'ACTIVE', NOW(), NOW())
    `, [businessId]);

    await client.query(`
      INSERT INTO core.locations (id, business_id, name, type, status, created_at, updated_at, version)
      VALUES ($1, $2, 'Test Location', 'STORE', 'ACTIVE', NOW(), NOW(), 1)
    `, [locationId, businessId]);

    await client.query(`
      INSERT INTO catalog.categories (id, business_id, name, status, created_at, updated_at, version)
      VALUES ($1, $2, 'Category', 'ACTIVE', NOW(), NOW(), 1)
    `, [categoryId, businessId]);

    await client.query(`
      INSERT INTO catalog.products (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
      VALUES ($1, $2, 'TEST-SKU', 'Test Product', $3, 'PCS', true, 'ACTIVE')
    `, [productId, businessId, categoryId]);
  });

  it("can insert cost_events and product_cost_states", async () => {
    if (client === undefined) throw new Error("client is not initialized.");
    
    const costEventId = randomUUID();

    const eventRes = await client.query(`
      INSERT INTO costing.cost_events (
        id, business_id, location_id, product_id, event_type, quantity_basis, unit_cost_before, unit_cost_after, value_delta, source_type, source_id, occurred_at
      )
      VALUES (
        $1, $2, $3, $4, 'INITIAL_COST', 10, 0, 15.5, 155, 'MANUAL', $4, NOW()
      )
      RETURNING *
    `, [costEventId, businessId, locationId, productId]);

    expect(eventRes.rowCount).toBe(1);

    const stateRes = await client.query(`
      INSERT INTO costing.product_cost_states (
        business_id, location_id, product_id, mwa_unit_cost, last_valid_mwa_unit_cost, latest_landed_unit_cost, pricing_reference_unit_cost, pricing_reference_source_type, last_cost_event_id, updated_at
      )
      VALUES (
        $1, $2, $3, 15.5, 15.5, 15.5, 15.5, 'INITIAL_COST', $4, NOW()
      )
      RETURNING *
    `, [businessId, locationId, productId, costEventId]);

    expect(stateRes.rowCount).toBe(1);
  });
});
