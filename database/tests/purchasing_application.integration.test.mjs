// @ts-check

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../scripts/migrations.mjs";
import { createPurchaseDraft } from "../../packages/domain/src/purchasing/commands.js";

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

describeWithPostgres("M5-002: Purchasing Application Commands", () => {
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
  const locationId = randomUUID();
  const userId = randomUUID();
  const supplierId = randomUUID();

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
      INSERT INTO catalog.suppliers (id, business_id, code, name, status, created_at, updated_at, version)
      VALUES ($1, $2, 'SUPP-1', 'Test Supplier', 'ACTIVE', NOW(), NOW(), 1)
    `, [supplierId, businessId]);
  });

  it("can create a purchase draft", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    const purchaseId = randomUUID();
    const ctx = {
      user_id: userId,
      business_id: businessId,
      permissions: new Set(["purchase.create"]),
    };

    const res = await createPurchaseDraft(ctx, client, {
      purchase_id: purchaseId,
      location_id: locationId,
      supplier_id: supplierId,
      purchase_number: "PUR-123",
      notes: "Test purchase",
    });

    expect(res.purchase_id).toBe(purchaseId);
    expect(res.version).toBe("1");

    const row = await client.query(`SELECT * FROM purchasing.purchases WHERE id = $1`, [purchaseId]);
    expect(row.rows[0].status).toBe("DRAFT");
    expect(row.rows[0].purchase_number).toBe("PUR-123");
  });

  it("rejects without permission", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    const purchaseId = randomUUID();
    const ctx = {
      user_id: userId,
      business_id: businessId,
      permissions: new Set(),
    };

    await expect(
      createPurchaseDraft(ctx, client, {
        purchase_id: purchaseId,
        location_id: locationId,
        supplier_id: supplierId,
        purchase_number: "PUR-124",
        notes: null,
      })
    ).rejects.toThrow(/Requires purchase.create/);
  });
});
