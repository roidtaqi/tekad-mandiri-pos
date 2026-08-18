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

describeWithPostgres("M5-003, M5-004, M5-005: Purchasing Fulfillment Schema", () => {
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
  const categoryId = randomUUID();
  const productId = randomUUID();
  const productUnitId = randomUUID();
  const supplierId = randomUUID();
  const purchaseId = randomUUID();
  const purchaseItemId = randomUUID();

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

    await client.query(`
      INSERT INTO catalog.product_units (id, product_id, unit_code, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status, created_at)
      VALUES ($1, $2, 'PCS', 1, true, true, false, 'ACTIVE', NOW())
    `, [productUnitId, productId]);

    await client.query(`
      INSERT INTO catalog.suppliers (id, business_id, code, name, status, created_at, updated_at, version)
      VALUES ($1, $2, 'SUPP-1', 'Test Supplier', 'ACTIVE', NOW(), NOW(), 1)
    `, [supplierId, businessId]);
    
    await client.query(`
      INSERT INTO purchasing.purchases (
        id, business_id, location_id, supplier_id, purchase_number, status, integrity_status, payment_status, purchase_date, created_by, created_at, updated_at, version
      )
      VALUES (
        $1, $2, $3, $4, 'PUR-001', 'ORDERED', 'CLEAR', 'UNPAID', CURRENT_DATE, $2, NOW(), NOW(), 1
      )
    `, [purchaseId, businessId, locationId, supplierId]);
    
    await client.query(`
      INSERT INTO purchasing.purchase_items (
        id, purchase_id, product_id, product_unit_id, product_name_snapshot, unit_name_snapshot, conversion_snapshot, expected_qty, created_at
      )
      VALUES (
        $1, $2, $3, $4, 'Test Product', 'PCS', 1, 10, NOW()
      )
    `, [purchaseItemId, purchaseId, productId, productUnitId]);
  });

  it("can insert a receipt and receipt_items", async () => {
    if (client === undefined) throw new Error("client is not initialized.");
    
    const receiptId = randomUUID();

    const res = await client.query(`
      INSERT INTO purchasing.receipts (
        id, business_id, location_id, purchase_id, receipt_number, received_at, received_by, created_at
      )
      VALUES (
        $1, $2, $3, $4, 'RCV-001', NOW(), $2, NOW()
      )
      RETURNING *
    `, [receiptId, businessId, locationId, purchaseId]);

    expect(res.rowCount).toBe(1);

    const itemRes = await client.query(`
      INSERT INTO purchasing.receipt_items (
        id, receipt_id, purchase_item_id, product_id, product_unit_id, conversion_snapshot, received_qty, accepted_qty, rejected_qty, free_qty_received, base_qty_accepted, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, 1, 10, 10, 0, 0, 10, NOW()
      )
      RETURNING *
    `, [randomUUID(), receiptId, purchaseItemId, productId, productUnitId]);

    expect(itemRes.rowCount).toBe(1);
  });

  it("can insert purchase_invoices and purchase_invoice_items", async () => {
    if (client === undefined) throw new Error("client is not initialized.");
    
    const invoiceId = randomUUID();

    const res = await client.query(`
      INSERT INTO purchasing.purchase_invoices (
        id, purchase_id, subtotal, item_discount_total, global_discount_total, tax_total, acquisition_charge_total, grand_total, captured_at, captured_by, version
      )
      VALUES (
        $1, $2, 100, 0, 0, 0, 0, 100, NOW(), $3, 1
      )
      RETURNING *
    `, [invoiceId, purchaseId, businessId]);

    expect(res.rowCount).toBe(1);

    const itemRes = await client.query(`
      INSERT INTO purchasing.purchase_invoice_items (
        id, invoice_id, purchase_item_id, invoiced_qty, unit_price, item_discount_amount, tax_amount, free_qty
      )
      VALUES (
        $1, $2, $3, 10, 10, 0, 0, 0
      )
      RETURNING *
    `, [randomUUID(), invoiceId, purchaseItemId]);

    expect(itemRes.rowCount).toBe(1);
  });
  
  it("can insert purchase_charges and purchase_payments", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    const chargeRes = await client.query(`
      INSERT INTO purchasing.purchase_charges (
        id, purchase_id, type, amount, allocation_method, created_at
      )
      VALUES (
        $1, $2, 'FREIGHT', 50, 'BY_ITEM_VALUE', NOW()
      )
      RETURNING *
    `, [randomUUID(), purchaseId]);

    expect(chargeRes.rowCount).toBe(1);

    const paymentRes = await client.query(`
      INSERT INTO purchasing.purchase_payments (
        id, purchase_id, amount, method, paid_at, recorded_by, created_at
      )
      VALUES (
        $1, $2, 150, 'CASH', NOW(), $3, NOW()
      )
      RETURNING *
    `, [randomUUID(), purchaseId, businessId]);

    expect(paymentRes.rowCount).toBe(1);
  });
});
