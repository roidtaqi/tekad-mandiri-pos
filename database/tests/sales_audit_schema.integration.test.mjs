// @ts-check

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../scripts/migrations.mjs";

const configuredAdminUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = configuredAdminUrl === undefined ? describe.skip : describe;

/** @type {Client | undefined} */
let adminClient;
/** @type {Client | undefined} */
let client;
/** @type {string | undefined} */
let childDatabaseName;

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

describeWithPostgres("Sales and Audit schema recovery", () => {
  const businessId = randomUUID();
  const locationId = randomUUID();
  const categoryId = randomUUID();
  const productId = randomUUID();
  const productUnitId = randomUUID();
  const userId = randomUUID();
  const deviceId = randomUUID();
  const terminalId = randomUUID();
  const shiftId = randomUUID();
  const paymentMethodId = randomUUID();

  beforeAll(async () => {
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();

    childDatabaseName = `kastur_migration_test_${randomUUID().replaceAll("-", "")}`;
    await adminClient.query(
      `CREATE DATABASE ${quoteGeneratedDatabaseName(childDatabaseName)}`,
    );

    const childUrl = requireSafeAdminUrl();
    childUrl.pathname = `/${childDatabaseName}`;
    await applyMigrations({ databaseUrl: childUrl.toString() });

    client = new Client({ connectionString: childUrl.toString() });
    await client.connect();

    await client.query(
      `INSERT INTO core.businesses (id, name, timezone, status)
       VALUES ($1, 'Sales Test', 'Asia/Makassar', 'ACTIVE')`,
      [businessId],
    );
    await client.query(
      `INSERT INTO core.locations
         (id, business_id, code, name, type, is_default, status)
       VALUES ($1, $2, 'MAIN', 'Main Store', 'STORE', true, 'ACTIVE')`,
      [locationId, businessId],
    );
    await client.query(
      `INSERT INTO catalog.categories (id, business_id, name, status)
       VALUES ($1, $2, 'General', 'ACTIVE')`,
      [categoryId, businessId],
    );
    await client.query(
      `INSERT INTO catalog.products
         (id, business_id, sku, name, category_id, base_unit_code, track_inventory, status)
       VALUES ($1, $2, 'SALE-001', 'Sale Product', $3, 'PCS', true, 'ACTIVE')`,
      [productId, businessId, categoryId],
    );
    await client.query(
      `INSERT INTO catalog.product_units
         (id, business_id, product_id, unit_code, display_name, conversion_factor,
          can_sell, can_purchase, allow_decimal_qty, status)
       VALUES ($1, $2, $3, 'PCS', 'PCS', 1, true, true, false, 'ACTIVE')`,
      [productUnitId, businessId, productId],
    );
    await client.query(
      `INSERT INTO identity.users (id, display_name, status)
       VALUES ($1, 'Cashier One', 'ACTIVE')`,
      [userId],
    );
    await client.query(
      `INSERT INTO identity.devices
         (id, business_id, device_key, status, first_seen_at)
       VALUES ($1, $2, 'sales-test-device', 'ACTIVE', CURRENT_TIMESTAMP)`,
      [deviceId, businessId],
    );
    await client.query(
      `INSERT INTO core.terminals
         (id, business_id, location_id, code, name, status)
       VALUES ($1, $2, $3, 'POS-01', 'POS 01', 'ACTIVE')`,
      [terminalId, businessId, locationId],
    );
    await client.query(
      `INSERT INTO cash.shifts
         (id, business_id, location_id, terminal_id, cashier_user_id, shift_number,
          status, opening_cash, opened_at, review_status)
       VALUES ($1, $2, $3, $4, $5, 'SHF-001', 'OPEN', 100000, CURRENT_TIMESTAMP, 'UNREVIEWED')`,
      [shiftId, businessId, locationId, terminalId, userId],
    );
    await client.query(
      `INSERT INTO sales.payment_methods
         (id, business_id, code, name, is_cash, offline_allowed, requires_reference, status)
       VALUES ($1, $2, 'CASH', 'Tunai', true, true, false, 'ACTIVE')`,
      [paymentMethodId, businessId],
    );
  });

  afterAll(async () => {
    await client?.end();
    if (adminClient !== undefined && childDatabaseName !== undefined) {
      await adminClient.query(
        `DROP DATABASE ${quoteGeneratedDatabaseName(childDatabaseName)} WITH (FORCE)`,
      );
    }
    await adminClient?.end();
  });

  it("applies Sales before Costing/Returns and persists a COST_PENDING sale aggregate", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    const transactionId = randomUUID();
    const transactionItemId = randomUUID();
    const paymentId = randomUUID();
    const correlationId = randomUUID();

    await client.query(
      `INSERT INTO sales.transactions
         (id, business_id, location_id, terminal_id, device_id, shift_id,
          transaction_number, status, subtotal, promotion_discount_total,
          line_discount_total, transaction_discount_total, tax_total, grand_total,
          total_paid, change_amount, cost_status, created_by, authorization_version,
          occurred_at, completed_at, correlation_id)
       VALUES
         ($1, $2, $3, $4, $5, $6, 'TRX-001', 'COMPLETED', 12500, 0,
          0, 0, 0, 12500, 12500, 2500, 'COST_PENDING', $7, 4,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $8)`,
      [
        transactionId,
        businessId,
        locationId,
        terminalId,
        deviceId,
        shiftId,
        userId,
        correlationId,
      ],
    );
    await client.query(
      `INSERT INTO sales.transaction_items
         (id, transaction_id, line_index, product_id, product_unit_id,
          product_name_snapshot, sku_snapshot, unit_code_snapshot, unit_name_snapshot,
          conversion_snapshot, quantity, base_quantity, base_unit_price_snapshot,
          tier_code_snapshot, tier_unit_price_snapshot, promotion_discount_snapshot,
          manual_line_discount_snapshot, transaction_discount_allocation,
          final_unit_price_snapshot, line_total, tax_mode_snapshot,
          tax_rate_snapshot, tax_amount_snapshot, cost_unit_snapshot, cost_status,
          track_inventory_snapshot, pricing_resolved_at_snapshot,
          pricing_time_status_snapshot)
       VALUES
         ($1, $2, 0, $3, $4, 'Sale Product', 'SALE-001', 'PCS', 'PCS',
          1, 1, 1, 12500, 'RETAIL', 12500, 0, 0, 0, 12500, 12500,
          'NO_PPN', 0, 0, NULL, 'COST_PENDING', true,
          CURRENT_TIMESTAMP, 'TRUSTED')`,
      [transactionItemId, transactionId, productId, productUnitId],
    );
    await client.query(
      `INSERT INTO sales.payments
         (id, business_id, transaction_id, payment_method_id, method_code_snapshot,
          amount, amount_tendered, change_amount, status, confirmation_type,
          received_at, completed_at, recorded_by, device_id, correlation_id)
       VALUES
         ($1, $2, $3, $4, 'CASH', 12500, 15000, 2500, 'COMPLETED',
          'CASH_CONFIRMED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5, $6, $7)`,
      [
        paymentId,
        businessId,
        transactionId,
        paymentMethodId,
        userId,
        deviceId,
        correlationId,
      ],
    );

    const result = await client.query(
      `SELECT t.cost_status, i.cost_status AS item_cost_status,
              i.cost_unit_snapshot, p.amount
       FROM sales.transactions t
       JOIN sales.transaction_items i ON i.transaction_id = t.id
       JOIN sales.payments p ON p.transaction_id = t.id
       WHERE t.id = $1`,
      [transactionId],
    );

    expect(result.rows).toEqual([
      {
        amount: "12500.0000",
        cost_status: "COST_PENDING",
        cost_unit_snapshot: null,
        item_cost_status: "COST_PENDING",
      },
    ]);
  });

  it("rejects a fake zero snapshot for COST_PENDING", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    const transactionId = randomUUID();
    await client.query(
      `INSERT INTO sales.transactions
         (id, business_id, location_id, terminal_id, device_id, shift_id,
          transaction_number, status, subtotal, promotion_discount_total,
          line_discount_total, transaction_discount_total, tax_total, grand_total,
          total_paid, change_amount, cost_status, created_by, authorization_version,
          occurred_at, completed_at, correlation_id)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED', 1, 0, 0, 0, 0, 1,
          1, 0, 'COST_PENDING', $8, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $9)`,
      [
        transactionId,
        businessId,
        locationId,
        terminalId,
        deviceId,
        shiftId,
        `TRX-${transactionId}`,
        userId,
        randomUUID(),
      ],
    );

    await expect(
      client.query(
        `INSERT INTO sales.transaction_items
           (id, transaction_id, line_index, product_id, product_unit_id,
            product_name_snapshot, sku_snapshot, unit_code_snapshot, unit_name_snapshot,
            conversion_snapshot, quantity, base_quantity, base_unit_price_snapshot,
            promotion_discount_snapshot, manual_line_discount_snapshot,
            transaction_discount_allocation, final_unit_price_snapshot, line_total,
            tax_mode_snapshot, tax_rate_snapshot, tax_amount_snapshot,
            cost_unit_snapshot, cost_status, track_inventory_snapshot,
            pricing_resolved_at_snapshot, pricing_time_status_snapshot)
         VALUES
           ($1, $2, 0, $3, $4, 'Sale Product', 'SALE-001', 'PCS', 'PCS',
            1, 1, 1, 1, 0, 0, 0, 1, 1, 'NO_PPN', 0, 0, 0,
            'COST_PENDING', true, CURRENT_TIMESTAMP, 'TRUSTED')`,
        [randomUUID(), transactionId, productId, productUnitId],
      ),
    ).rejects.toThrow(/transaction_items_cost_pending_check/u);
  });

  it("persists attributable append-oriented audit and exception facts", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    const entityId = randomUUID();
    const correlationId = randomUUID();
    const auditResult = await client.query(
      `INSERT INTO audit.audit_events
         (id, business_id, location_id, actor_type, actor_user_id, action,
          entity_type, entity_id, occurred_at, device_id, correlation_id,
          authorization_version, after_data)
       VALUES
         ($1, $2, $3, 'USER', $4, 'TRANSACTION_COMPLETED', 'transaction',
          $5, CURRENT_TIMESTAMP, $6, $7, 4, '{"status":"COMPLETED"}'::jsonb)
       RETURNING action, actor_type`,
      [
        randomUUID(),
        businessId,
        locationId,
        userId,
        entityId,
        deviceId,
        correlationId,
      ],
    );
    const exceptionResult = await client.query(
      `INSERT INTO audit.business_exceptions
         (id, business_id, location_id, domain, exception_type, severity, status,
          source_entity_type, source_entity_id, summary)
       VALUES
         ($1, $2, $3, 'COSTING', 'COST_MISSING_EXCEPTION', 'REVIEW_REQUIRED',
          'OPEN', 'transaction', $4, 'Cost requires reconciliation')
       RETURNING severity, status`,
      [randomUUID(), businessId, locationId, entityId],
    );

    expect(auditResult.rows[0]).toEqual({
      action: "TRANSACTION_COMPLETED",
      actor_type: "USER",
    });
    expect(exceptionResult.rows[0]).toEqual({
      severity: "REVIEW_REQUIRED",
      status: "OPEN",
    });
  });
});
