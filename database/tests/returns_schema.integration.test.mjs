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

describeWithPostgres("M9: Returns Schema", () => {
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

    await applyMigrations({ databaseUrl: childDatabaseUrl });

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
  const userId = randomUUID();
  const deviceId = randomUUID();
  const terminalId = randomUUID();
  const shiftId = randomUUID();
  const transactionId = randomUUID();
  const paymentMethodId = randomUUID();

  beforeAll(async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    await client.query(`
      INSERT INTO core.businesses (id, name, timezone, status, created_at, updated_at)
      VALUES ($1, 'Test Business', 'Asia/Makassar', 'ACTIVE', NOW(), NOW())
    `, [businessId]);

    await client.query(`
      INSERT INTO core.locations (id, business_id, code, name, type, is_default, status, created_at, updated_at, version)
      VALUES ($1, $2, 'MAIN', 'Test Location', 'STORE', true, 'ACTIVE', NOW(), NOW(), 1)
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
      INSERT INTO catalog.product_units (id, business_id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status, created_at)
      VALUES ($1, $2, $3, 'PCS', 'PCS', 1, true, true, false, 'ACTIVE', NOW())
    `, [productUnitId, businessId, productId]);

    await client.query(`
      INSERT INTO identity.users (id, display_name, email, status, created_at, updated_at, version)
      VALUES ($1, 'Test User', 'test@example.com', 'ACTIVE', NOW(), NOW(), 1)
    `, [userId]);

    await client.query(`
      INSERT INTO identity.devices (id, business_id, device_key, status, first_seen_at, created_at)
      VALUES ($1, $2, 'returns-test-device', 'ACTIVE', NOW(), NOW())
    `, [deviceId, businessId]);

    await client.query(`
      INSERT INTO core.terminals (id, business_id, location_id, code, name, status, created_at, updated_at, version)
      VALUES ($1, $2, $3, 'POS-01', 'Terminal 1', 'ACTIVE', NOW(), NOW(), 1)
    `, [terminalId, businessId, locationId]);

    await client.query(`
      INSERT INTO sales.payment_methods (
        id, business_id, code, name, is_cash, offline_allowed,
        requires_reference, status
      ) VALUES ($1, $2, 'CARD', 'Card', false, false, false, 'ACTIVE')
    `, [paymentMethodId, businessId]);

    await client.query(`
      INSERT INTO cash.shifts (id, business_id, location_id, terminal_id, cashier_user_id, shift_number, status, opening_cash, opened_at, review_status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'SHF-RETURNS', 'OPEN', 0, NOW(), 'UNREVIEWED', NOW())
    `, [shiftId, businessId, locationId, terminalId, userId]);

    await client.query(`
      INSERT INTO sales.transactions (
        id, business_id, location_id, terminal_id, device_id, shift_id, transaction_number, status,
        subtotal, promotion_discount_total, line_discount_total, transaction_discount_total, tax_total, grand_total, total_paid, change_amount, cost_status, created_by, authorization_version, occurred_at, completed_at, correlation_id, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, 'TRX-001', 'COMPLETED',
        100, 0, 0, 0, 0, 100, 100, 0, 'FINAL', $7, 1, NOW(), NOW(), $8, NOW()
      )
    `, [transactionId, businessId, locationId, terminalId, deviceId, shiftId, userId, randomUUID()]);

    await client.query(`
      INSERT INTO sales.transaction_items (
        id, transaction_id, line_index, product_id, product_unit_id, product_name_snapshot, sku_snapshot, unit_code_snapshot, unit_name_snapshot, conversion_snapshot,
        quantity, base_quantity, base_unit_price_snapshot, promotion_discount_snapshot, manual_line_discount_snapshot, transaction_discount_allocation,
        final_unit_price_snapshot, line_total, tax_mode_snapshot, tax_rate_snapshot, tax_amount_snapshot, cost_unit_snapshot, cost_status, track_inventory_snapshot,
        pricing_resolved_at_snapshot, pricing_time_status_snapshot, created_at
      )
      VALUES (
        $1, $2, 0, $3, $4, 'Test Product', 'TEST-SKU', 'PCS', 'PCS', 1,
        1, 1, 100, 0, 0, 0,
        100, 100, 'TAX_INCLUSIVE', 0, 0, 80, 'FINAL', true,
        NOW(), 'TRUSTED', NOW()
      )
    `, [randomUUID(), transactionId, productId, productUnitId]);
  });

  it("can insert returns and items", async () => {
    if (client === undefined) throw new Error("client is not initialized.");
    
    const returnId = randomUUID();

    await client.query(`
      INSERT INTO returns.customer_returns (
        id, business_id, location_id, return_number, original_transaction_id,
        return_type, status, receipt_mode, risk_level, refund_status,
        return_total, refunded_total, reason_code, created_by, processed_by,
        occurred_at, correlation_id, created_at, version,
        return_window_days_snapshot, return_age_days, window_override
      )
      VALUES (
        $1, $2, $3, 'RET-001', $4,
        'PARTIAL', 'COMPLETED', 'TRANSACTION_LINKED', 'STANDARD', 'NONE',
        100, 0, 'DAMAGED', $5, $5, NOW(), $6, NOW(), 1, 7, 0, false
      )
    `, [returnId, businessId, locationId, transactionId, userId, randomUUID()]);

    const itemRes = await client.query(`
      INSERT INTO returns.return_items (
        id, customer_return_id, original_transaction_item_id, product_id,
        product_unit_id, product_name_snapshot, unit_name_snapshot,
        conversion_snapshot, return_qty, base_return_qty, refund_unit_price,
        refund_total, original_effective_unit_price, refundable_amount,
        disposition, reason_code, return_loss_category,
        normal_disposition_snapshot, disposition_override
      )
      VALUES (
        $1, $2, (SELECT id FROM sales.transaction_items WHERE transaction_id = $3),
        $4, $5, 'Test Product', 'PCS', 1, 1, 1, 100, 100, 100, 100,
        'NOT_RESTOCKED', 'DAMAGED', 'DAMAGED_RETURN',
        'NOT_RESTOCKED', false
      )
      RETURNING *
    `, [randomUUID(), returnId, transactionId, productId, productUnitId]);

    expect(itemRes.rowCount).toBe(1);
  });

  it("seeds authoritative Business defaults when a default Location is created", async () => {
    if (client === undefined) throw new Error("client is not initialized.");

    const settings = await client.query(
      `SELECT return_window_days, allow_no_receipt_return
       FROM core.business_settings WHERE business_id = $1`,
      [businessId],
    );
    expect(settings.rows[0]).toMatchObject({
      allow_no_receipt_return: false,
      return_window_days: 7,
    });
    const reasons = await client.query(
      `SELECT reason_code, normal_disposition
       FROM returns.return_reason_policies
       WHERE business_id = $1 ORDER BY reason_code`,
      [businessId],
    );
    expect(reasons.rows).toEqual([
      { normal_disposition: "NOT_RESTOCKED", reason_code: "DAMAGED" },
      { normal_disposition: "NOT_RESTOCKED", reason_code: "EXPIRED" },
    ]);
  });

  it("derives aggregate Refund status from all Refund lifecycle records", async () => {
    if (client === undefined) throw new Error("client is not initialized.");
    const returnId = randomUUID();
    const firstRefundId = randomUUID();
    const secondRefundId = randomUUID();
    const correctionRefundId = randomUUID();
    await client.query(
      `INSERT INTO returns.customer_returns (
         id, business_id, location_id, return_number, original_transaction_id,
         status, refund_status, return_total, refunded_total, reason_code,
         created_by, processed_by, occurred_at, correlation_id, created_at,
         completed_at, version, return_type, receipt_mode, risk_level,
         return_window_days_snapshot, return_age_days, window_override
       ) VALUES (
         $1, $2, $3, $4, $5, 'COMPLETED', 'NONE', 100, 0, 'DAMAGED',
         $6, $6, CURRENT_TIMESTAMP, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
         1, 'PARTIAL', 'TRANSACTION_LINKED', 'STANDARD', 7, 0, false
       )`,
      [returnId, businessId, locationId, `RET-${returnId}`, transactionId, userId, randomUUID()],
    );
    await client.query(
      `INSERT INTO returns.refunds (
         id, customer_return_id, business_id, location_id, amount,
         payment_method_id, status, processed_at, processed_by, completed_at,
         created_at, version, refund_number, requested_at, correlation_id
       ) VALUES ($1, $2, $3, $4, 40, $5, 'COMPLETED', CURRENT_TIMESTAMP,
                 $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                 1, $7, CURRENT_TIMESTAMP, $8)`,
      [
        firstRefundId,
        returnId,
        businessId,
        locationId,
        paymentMethodId,
        userId,
        `RFN-${firstRefundId}`,
        randomUUID(),
      ],
    );
    expect((await client.query(
      `SELECT status, refund_status, refunded_total::text
       FROM returns.customer_returns WHERE id = $1`,
      [returnId],
    )).rows[0]).toMatchObject({
      refund_status: "PARTIAL",
      refunded_total: "40.0000",
      status: "COMPLETED",
    });

    await client.query(
      `INSERT INTO returns.refunds (
         id, customer_return_id, business_id, location_id, amount,
         payment_method_id, status, created_at, version, refund_number,
         requested_at, correlation_id
       ) VALUES ($1, $2, $3, $4, 60, $5, 'PENDING', CURRENT_TIMESTAMP,
                 1, $6, CURRENT_TIMESTAMP, $7)`,
      [secondRefundId, returnId, businessId, locationId, paymentMethodId, `RFN-${secondRefundId}`, randomUUID()],
    );
    await client.query(
      `WITH transitioned AS (
         UPDATE returns.refunds
         SET status = 'REVERSED', processed_at = CURRENT_TIMESTAMP,
             processed_by = $2, version = 2
         WHERE id = $1
         RETURNING *
       )
       INSERT INTO returns.refund_lifecycle_events (
         id, business_id, location_id, customer_return_id, refund_id, command_id,
         event_type, prior_status, new_status, reason, external_reference,
         occurred_at, actor_user_id, device_id, correlation_id
       )
       SELECT $3, business_id, location_id, customer_return_id, id, $4,
              'REVERSED', 'COMPLETED', status, 'Schema lifecycle proof',
              external_reference, processed_at, processed_by, device_id, $5
       FROM transitioned`,
      [firstRefundId, userId, randomUUID(), randomUUID(), randomUUID()],
    );
    await client.query(
      `WITH transitioned AS (
         UPDATE returns.refunds
         SET status = 'FAILED', processed_at = CURRENT_TIMESTAMP, processed_by = $2,
             failed_at = CURRENT_TIMESTAMP, version = 2
         WHERE id = $1
         RETURNING *
       )
       INSERT INTO returns.refund_lifecycle_events (
         id, business_id, location_id, customer_return_id, refund_id, command_id,
         event_type, prior_status, new_status, reason, external_reference,
         occurred_at, actor_user_id, device_id, correlation_id
       )
       SELECT $3, business_id, location_id, customer_return_id, id, $4,
              'RESOLVED_FAILED', 'PENDING', status, 'Schema lifecycle proof',
              external_reference, processed_at, processed_by, device_id, $5
       FROM transitioned`,
      [secondRefundId, userId, randomUUID(), randomUUID(), randomUUID()],
    );
    expect((await client.query(
      `SELECT status, refund_status, refunded_total::text
       FROM returns.customer_returns WHERE id = $1`,
      [returnId],
    )).rows[0]).toMatchObject({
      refund_status: "PENDING",
      refunded_total: "0.0000",
      status: "COMPLETED",
    });

    await client.query(
      `WITH transitioned AS (
         UPDATE returns.refunds
         SET status = 'COMPLETED', processed_at = CURRENT_TIMESTAMP, processed_by = $2,
             completed_at = CURRENT_TIMESTAMP, failed_at = NULL, version = 3
         WHERE id = $1
         RETURNING *
       )
       INSERT INTO returns.refund_lifecycle_events (
         id, business_id, location_id, customer_return_id, refund_id, command_id,
         event_type, prior_status, new_status, reason, external_reference,
         occurred_at, actor_user_id, device_id, correlation_id
       )
       SELECT $3, business_id, location_id, customer_return_id, id, $4,
              'RESOLVED_COMPLETED', 'FAILED', status, 'Schema lifecycle proof',
              external_reference, processed_at, processed_by, device_id, $5
       FROM transitioned`,
      [secondRefundId, userId, randomUUID(), randomUUID(), randomUUID()],
    );
    await client.query(
      `INSERT INTO returns.refunds (
         id, customer_return_id, business_id, location_id, amount,
         payment_method_id, status, processed_at, processed_by, completed_at,
         created_at, version, refund_number, requested_at, correlation_id
       ) VALUES ($1, $2, $3, $4, 40, $5, 'COMPLETED', CURRENT_TIMESTAMP,
                 $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                 1, $7, CURRENT_TIMESTAMP, $8)`,
      [
        correctionRefundId,
        returnId,
        businessId,
        locationId,
        paymentMethodId,
        userId,
        `RFN-${correctionRefundId}`,
        randomUUID(),
      ],
    );
    expect((await client.query(
      `SELECT status, refund_status, refunded_total::text
       FROM returns.customer_returns WHERE id = $1`,
      [returnId],
    )).rows[0]).toMatchObject({
      refund_status: "COMPLETED",
      refunded_total: "100.0000",
      status: "COMPLETED",
    });
  });
});
