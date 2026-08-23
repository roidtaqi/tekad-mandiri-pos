// @ts-check

import { createHash, randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handleRequest } from "../../apps/api/src/index.js";
import { applyMigrations } from "../scripts/migrations.mjs";

const configuredAdminUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = configuredAdminUrl === undefined ? describe.skip : describe;

/** @type {Client | undefined} */
let adminClient;
/** @type {Client | undefined} */
let client;
/** @type {string | undefined} */
let childDatabaseName;
/** @type {string | undefined} */
let childDatabaseUrl;

function requireAdminUrl() {
  if (configuredAdminUrl === undefined) throw new Error("TEST_DATABASE_URL is required.");
  return new URL(configuredAdminUrl);
}

/** @param {string} name */
function quoteDatabase(name) {
  if (!/^kastur_migration_test_[0-9a-f]{32}$/u.test(name)) {
    throw new Error(`Refusing unsafe database name: ${name}`);
  }
  return `"${name}"`;
}

function database() {
  if (client === undefined) throw new Error("Database is not initialized.");
  return client;
}

function databaseUrl() {
  if (childDatabaseUrl === undefined) throw new Error("Database URL is not initialized.");
  return childDatabaseUrl;
}

/** @param {string} value */
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * @param {string} secret
 * @param {string} deviceId
 * @param {string} locationId
 * @param {number} authorizationVersion
 * @param {string} commandType
 * @param {Record<string, unknown>} payload
 * @param {{command_id?: string, correlation_id?: string, occurred_at?: string}} [identity]
 */
async function command(
  secret,
  deviceId,
  locationId,
  authorizationVersion,
  commandType,
  payload,
  identity = {},
) {
  const commandId = identity.command_id ?? randomUUID();
  const occurredAt =
    identity.occurred_at ?? (typeof payload.occurred_at === "string"
      ? payload.occurred_at
      : typeof payload.received_at === "string"
        ? payload.received_at
        : typeof payload.captured_at === "string"
          ? payload.captured_at
          : new Date().toISOString());
  const response = await handleRequest(
    new Request("https://api.kastur.test/api/v1/commands", {
      body: JSON.stringify({
        authorization_version: authorizationVersion,
        command_id: commandId,
        command_type: commandType,
        correlation_id: identity.correlation_id ?? randomUUID(),
        device_id: deviceId,
        location_id: locationId,
        occurred_at: occurredAt,
        payload,
        schema_version: 1,
      }),
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        "idempotency-key": commandId,
      },
      method: "POST",
    }),
    { DATABASE_URL: databaseUrl() },
  );
  const body = /** @type {Record<string, any>} */ (await response.json());
  if (!response.ok) {
    throw new Error(`${commandType} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body.result;
}

/**
 * Same request helper for asserting a stable API rejection.
 * @param {string} secret
 * @param {string} deviceId
 * @param {string} locationId
 * @param {number} authorizationVersion
 * @param {string} commandType
 * @param {Record<string, unknown>} payload
 */
async function rejectedCommand(secret, deviceId, locationId, authorizationVersion, commandType, payload) {
  const commandId = randomUUID();
  const occurredAt =
    typeof payload.occurred_at === "string"
      ? payload.occurred_at
      : typeof payload.received_at === "string"
        ? payload.received_at
        : typeof payload.captured_at === "string"
          ? payload.captured_at
          : new Date().toISOString();
  const response = await handleRequest(
    new Request("https://api.kastur.test/api/v1/commands", {
      body: JSON.stringify({
        authorization_version: authorizationVersion,
        command_id: commandId,
        command_type: commandType,
        correlation_id: randomUUID(),
        device_id: deviceId,
        location_id: locationId,
        occurred_at: occurredAt,
        payload,
        schema_version: 1,
      }),
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        "idempotency-key": commandId,
      },
      method: "POST",
    }),
    { DATABASE_URL: databaseUrl() },
  );
  return {
    body: /** @type {Record<string, any>} */ (await response.json()),
    status: response.status,
  };
}

/**
 * @param {string} secret
 * @param {string} resource
 */
async function backofficeResource(secret, resource) {
  const response = await handleRequest(
    new Request(`https://api.kastur.test/api/v1/backoffice/${resource}`, {
      headers: { authorization: `Bearer ${secret}` },
    }),
    { DATABASE_URL: databaseUrl() },
  );
  const body = /** @type {Record<string, any>} */ (await response.json());
  if (!response.ok) {
    throw new Error(`Back Office ${resource} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body.data;
}

/**
 * @param {string} secret
 * @param {string} deviceId
 * @param {string} terminalId
 * @param {string} path
 */
async function returnSaleQuery(secret, deviceId, terminalId, path) {
  const response = await handleRequest(
    new Request(`https://api.kastur.test${path}`, {
      headers: {
        authorization: `Bearer ${secret}`,
        "x-kastur-client": "pos",
        "x-kastur-device-id": deviceId,
        "x-terminal-id": terminalId,
      },
    }),
    { DATABASE_URL: databaseUrl() },
  );
  return {
    body: /** @type {Record<string, any>} */ (await response.json()),
    status: response.status,
  };
}

describeWithPostgres("authenticated API operational Gates C-F", () => {
  const businessId = randomUUID();
  const locationId = randomUUID();
  const ownerUserId = randomUUID();
  const membershipId = randomUUID();
  const deviceId = randomUUID();
  const lookupDeviceId = randomUUID();
  const sessionId = randomUUID();
  const lookupSessionId = randomUUID();
  const terminalId = randomUUID();
  const lookupTerminalId = randomUUID();
  const shiftId = randomUUID();
  const categoryId = randomUUID();
  const productId = randomUUID();
  const productUnitId = randomUUID();
  const supplierId = randomUUID();
  const cashMethodId = randomUUID();
  const cardMethodId = randomUUID();
  const saleId = randomUUID();
  const saleItemId = randomUUID();
  const salePaymentId = randomUUID();
  const expiredSaleId = randomUUID();
  const expiredSaleItemId = randomUUID();
  const expiredSalePaymentId = randomUUID();
  const sessionSecret = `owner-operational-${randomUUID()}`;
  const lookupSessionSecret = `owner-return-lookup-${randomUUID()}`;
  const authorizationVersion = 11;

  beforeAll(async () => {
    const adminUrl = requireAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();
    childDatabaseName = `kastur_migration_test_${randomUUID().replaceAll("-", "")}`;
    await adminClient.query(`CREATE DATABASE ${quoteDatabase(childDatabaseName)}`);
    const childUrl = requireAdminUrl();
    childUrl.pathname = `/${childDatabaseName}`;
    childDatabaseUrl = childUrl.toString();
    await applyMigrations({ databaseUrl: childDatabaseUrl });
    client = new Client({ connectionString: childDatabaseUrl });
    await client.connect();

    await database().query(
      `INSERT INTO core.businesses (id, name, timezone, status)
       VALUES ($1, 'Operational Gates', 'Asia/Makassar', 'ACTIVE')`,
      [businessId],
    );
    await database().query(
      `INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
       VALUES ($1, $2, 'MAIN', 'Main Store', 'STORE', TRUE, 'ACTIVE')`,
      [locationId, businessId],
    );
    await database().query(
      `INSERT INTO returns.return_reason_policies (
         business_id, reason_code, normal_disposition
       ) VALUES ($1, 'OTHER', 'NOT_RESTOCKED')`,
      [businessId],
    );
    await database().query(
      `INSERT INTO identity.users (id, display_name, email, status)
       VALUES ($1, 'Owner', 'owner-gates@example.test', 'ACTIVE')`,
      [ownerUserId],
    );
    await database().query(
      `INSERT INTO identity.business_memberships (id, business_id, user_id, status)
       VALUES ($1, $2, $3, 'ACTIVE')`,
      [membershipId, businessId, ownerUserId],
    );
    await database().query(
      `INSERT INTO identity.membership_roles (membership_id, role_id, is_primary)
       VALUES ($1, '11111111-1111-4111-8111-111111111111', TRUE)`,
      [membershipId],
    );
    await database().query(
      `INSERT INTO identity.authorization_versions (membership_id, version)
       VALUES ($1, $2)`,
      [membershipId, authorizationVersion],
    );
    await database().query(
      `INSERT INTO identity.devices (id, business_id, device_key, name, platform, status)
       VALUES
         ($1, $3, 'owner-gates', 'Owner Device', 'PWA', 'ACTIVE'),
         ($2, $3, 'return-lookup', 'Return Lookup Device', 'PWA', 'ACTIVE')`,
      [deviceId, lookupDeviceId, businessId],
    );
    await database().query(
      `INSERT INTO identity.sessions
         (id, user_id, business_id, device_id, session_secret_hash, expires_at)
       VALUES
         ($1, $3, $4, $5, $7, CURRENT_TIMESTAMP + INTERVAL '1 day'),
         ($2, $3, $4, $6, $8, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
      [
        sessionId,
        lookupSessionId,
        ownerUserId,
        businessId,
        deviceId,
        lookupDeviceId,
        sha256(sessionSecret),
        sha256(lookupSessionSecret),
      ],
    );
    await database().query(
      `INSERT INTO core.terminals (id, business_id, location_id, code, name, status)
       VALUES
         ($1, $3, $4, 'POS-01', 'POS 01', 'ACTIVE'),
         ($2, $3, $4, 'POS-02', 'POS 02', 'ACTIVE')`,
      [terminalId, lookupTerminalId, businessId, locationId],
    );
    await database().query(
      `INSERT INTO cash.shifts (
         id, business_id, location_id, terminal_id, cashier_user_id,
         shift_number, status, opening_cash, opened_at, review_status
       ) VALUES ($1, $2, $3, $4, $5, 'SHIFT-GATES', 'OPEN', 100, CURRENT_TIMESTAMP, 'UNREVIEWED')`,
      [shiftId, businessId, locationId, terminalId, ownerUserId],
    );
    await database().query(
      `INSERT INTO catalog.categories (id, business_id, name, status)
       VALUES ($1, $2, 'General', 'ACTIVE')`,
      [categoryId, businessId],
    );
    await database().query(
      `INSERT INTO catalog.products (
         id, business_id, sku, name, category_id, base_unit_code,
         track_inventory, status
       ) VALUES ($1, $2, 'GATE-001', 'Gate Product', $3, 'PCS', TRUE, 'ACTIVE')`,
      [productId, businessId, categoryId],
    );
    await database().query(
      `INSERT INTO catalog.product_units (
         id, business_id, product_id, unit_code, display_name, conversion_factor,
         can_sell, can_purchase, allow_decimal_qty, status
       ) VALUES ($1, $2, $3, 'PCS', 'Piece', 1, TRUE, TRUE, FALSE, 'ACTIVE')`,
      [productUnitId, businessId, productId],
    );
    await database().query(
      `INSERT INTO catalog.suppliers
         (id, business_id, code, name, status, created_at, updated_at, version)
       VALUES ($1, $2, 'SUP-01', 'Supplier', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
      [supplierId, businessId],
    );
    await database().query(
      `INSERT INTO sales.payment_methods (
         id, business_id, code, name, is_cash, offline_allowed, requires_reference, status
       ) VALUES
         ($1, $3, 'CASH', 'Cash', TRUE, TRUE, FALSE, 'ACTIVE'),
         ($2, $3, 'CARD', 'Card', FALSE, FALSE, TRUE, 'ACTIVE')`,
      [cashMethodId, cardMethodId, businessId],
    );

    // Immutable completed sale fixture used by the Return gate. It is not
    // edited by any Return command; only Return/Refund/Ledger records append.
    await database().query(
      `INSERT INTO sales.transactions (
         id, business_id, location_id, terminal_id, device_id, shift_id,
         transaction_number, status, subtotal, promotion_discount_total,
         line_discount_total, transaction_discount_total, tax_total, grand_total,
         total_paid, change_amount, cost_status, created_by, authorization_version,
         occurred_at, completed_at, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6, 'TRX-GATES', 'COMPLETED',
                 30, 0, 0, 0, 0, 30, 30, 0, 'FINAL', $7, $8,
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $9)`,
      [
        saleId,
        businessId,
        locationId,
        terminalId,
        deviceId,
        shiftId,
        ownerUserId,
        authorizationVersion,
        randomUUID(),
      ],
    );
    await database().query(
      `INSERT INTO sales.transaction_items (
         id, transaction_id, line_index, product_id, product_unit_id,
         product_name_snapshot, sku_snapshot, unit_code_snapshot, unit_name_snapshot,
         conversion_snapshot, quantity, base_quantity, base_unit_price_snapshot,
         promotion_discount_snapshot, manual_line_discount_snapshot,
         transaction_discount_allocation, final_unit_price_snapshot, line_total,
         tax_mode_snapshot, tax_rate_snapshot, tax_amount_snapshot,
         cost_unit_snapshot, cost_status, track_inventory_snapshot,
         pricing_resolved_at_snapshot, pricing_time_status_snapshot
       ) VALUES ($1, $2, 0, $3, $4, 'Gate Product', 'GATE-001', 'PCS', 'Piece',
                 1, 2, 2, 15, 0, 0, 0, 15, 30,
                 'TAX_INCLUSIVE', 0, 0, 10.4, 'FINAL', TRUE,
                 CURRENT_TIMESTAMP, 'TRUSTED')`,
      [saleItemId, saleId, productId, productUnitId],
    );
    await database().query(
      `INSERT INTO sales.payments (
         id, business_id, transaction_id, payment_method_id,
         method_code_snapshot, amount, status, confirmation_type,
         received_at, completed_at, recorded_by, device_id
       ) VALUES ($1, $2, $3, $4, 'CARD', 30, 'COMPLETED', 'PROVIDER_VERIFIED',
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5, $6)`,
      [salePaymentId, businessId, saleId, cardMethodId, ownerUserId, deviceId],
    );

    // A separate immutable historical Sale proves the Return-window policy.
    // The active fixture above must remain untouched for subsequent Return
    // quantity, settlement, and original-Sale immutability assertions.
    await database().query(
      `INSERT INTO sales.transactions (
         id, business_id, location_id, terminal_id, device_id, shift_id,
         transaction_number, status, subtotal, promotion_discount_total,
         line_discount_total, transaction_discount_total, tax_total, grand_total,
         total_paid, change_amount, cost_status, created_by, authorization_version,
         occurred_at, completed_at, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6, 'TRX-GATES-EXPIRED', 'COMPLETED',
                 30, 0, 0, 0, 0, 30, 30, 0, 'FINAL', $7, $8,
                 CURRENT_TIMESTAMP - INTERVAL '10 days',
                 CURRENT_TIMESTAMP - INTERVAL '10 days', $9)`,
      [
        expiredSaleId,
        businessId,
        locationId,
        terminalId,
        deviceId,
        shiftId,
        ownerUserId,
        authorizationVersion,
        randomUUID(),
      ],
    );
    await database().query(
      `INSERT INTO sales.transaction_items (
         id, transaction_id, line_index, product_id, product_unit_id,
         product_name_snapshot, sku_snapshot, unit_code_snapshot, unit_name_snapshot,
         conversion_snapshot, quantity, base_quantity, base_unit_price_snapshot,
         promotion_discount_snapshot, manual_line_discount_snapshot,
         transaction_discount_allocation, final_unit_price_snapshot, line_total,
         tax_mode_snapshot, tax_rate_snapshot, tax_amount_snapshot,
         cost_unit_snapshot, cost_status, track_inventory_snapshot,
         pricing_resolved_at_snapshot, pricing_time_status_snapshot
       ) VALUES ($1, $2, 0, $3, $4, 'Gate Product', 'GATE-001', 'PCS', 'Piece',
                 1, 2, 2, 15, 0, 0, 0, 15, 30,
                 'TAX_INCLUSIVE', 0, 0, 10.4, 'FINAL', TRUE,
                 CURRENT_TIMESTAMP - INTERVAL '10 days', 'TRUSTED')`,
      [expiredSaleItemId, expiredSaleId, productId, productUnitId],
    );
    await database().query(
      `INSERT INTO sales.payments (
         id, business_id, transaction_id, payment_method_id,
         method_code_snapshot, amount, status, confirmation_type,
         received_at, completed_at, recorded_by, device_id
       ) VALUES ($1, $2, $3, $4, 'CARD', 30, 'COMPLETED', 'PROVIDER_VERIFIED',
                 CURRENT_TIMESTAMP - INTERVAL '10 days',
                 CURRENT_TIMESTAMP - INTERVAL '10 days', $5, $6)`,
      [
        expiredSalePaymentId,
        businessId,
        expiredSaleId,
        cardMethodId,
        ownerUserId,
        deviceId,
      ],
    );
  });

  afterAll(async () => {
    if (client !== undefined) await client.end();
    if (adminClient !== undefined) {
      if (childDatabaseName !== undefined) {
        await adminClient.query(`DROP DATABASE ${quoteDatabase(childDatabaseName)} WITH (FORCE)`);
      }
      await adminClient.end();
    }
  });

  it("proves Purchase, Costing, Pricing, Inventory, Opname, Return and Refund effects", async () => {
    const purchaseId = randomUUID();
    const purchaseItemId = randomUUID();
    const purchase = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "purchasing.purchase.create",
      {
        items: [
          {
            agreed_discount_amount: "0.0000",
            agreed_free_qty: "0.000000",
            agreed_unit_price: "10.0000",
            conversion_snapshot: "1.00000000",
            expected_qty: "10.000000",
            item_id: purchaseItemId,
            product_id: productId,
            product_unit_id: productUnitId,
          },
        ],
        notes: "Gate C",
        purchase_date: "2026-08-23",
        purchase_id: purchaseId,
        purchase_number: `PUR-${purchaseId.slice(0, 8)}`,
        supplier_id: supplierId,
      },
    );
    expect(purchase.status).toBe("DRAFT");

    const receivedAt = new Date().toISOString();
    const receiptItemId = randomUUID();
    const receipt = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "purchasing.receive_goods",
      {
        items: [
          {
            accepted_qty: "4.000000",
            conversion_snapshot: "1.00000000",
            free_qty_received: "1.000000",
            product_id: productId,
            product_unit_id: productUnitId,
            purchase_item_id: purchaseItemId,
            receipt_item_id: receiptItemId,
            received_qty: "5.000000",
            rejected_qty: "1.000000",
            rejection_reason: "DAMAGED",
          },
        ],
        notes: "Partial receipt",
        purchase_id: purchaseId,
        receipt_id: randomUUID(),
        receipt_number: `RCV-${purchaseId.slice(0, 8)}`,
        received_at: receivedAt,
      },
    );
    expect(receipt.purchase_status).toBe("PARTIALLY_RECEIVED");
    expect(receipt.stock_movements[0].base_quantity_delta).toBe("5");

    const capturedAt = new Date().toISOString();
    const invoice = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "purchasing.invoice.upsert",
      {
        acquisition_charge_total: "8.0000",
        captured_at: capturedAt,
        charges: [
          {
            allocation_method: "BY_ITEM_VALUE",
            amount: "8.0000",
            charge_id: randomUUID(),
            description: "Freight",
            type: "FREIGHT",
          },
        ],
        expected_invoice_version: 0,
        expected_purchase_version: 2,
        global_discount_total: "4.0000",
        grand_total: "52.0000",
        invoice_date: "2026-08-23",
        invoice_id: randomUUID(),
        item_discount_total: "0.0000",
        items: [
          {
            free_qty: "1.000000",
            invoice_item_id: randomUUID(),
            invoiced_qty: "4.000000",
            item_discount_amount: "0.0000",
            purchase_item_id: purchaseItemId,
            tax_amount: "0.0000",
            unit_price: "12.0000",
          },
        ],
        purchase_id: purchaseId,
        subtotal: "48.0000",
        supplier_invoice_number: `INV-${purchaseId.slice(0, 8)}`,
        tax_total: "0.0000",
      },
    );
    expect(invoice.purchase_status).toBe("READY_TO_POST");
    expect(invoice.purchase_version).toBe("3");

    const posted = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "purchasing.purchase.post",
      {
        accepted_integrity_exception_ids: [],
        expected_version: 3,
        notes: "Final commercial validation",
        purchase_id: purchaseId,
      },
    );
    expect(posted.status).toBe("POSTED");
    expect(posted.final_costs[0].final_landed_cost_per_base_unit).toBe("10.4");
    const costState = await database().query(
      `SELECT mwa_unit_cost::text, pricing_reference_unit_cost::text,
              cost_status, cost_source_type, cost_source_id
       FROM costing.product_cost_states
       WHERE business_id = $1 AND location_id = $2 AND product_id = $3`,
      [businessId, locationId, productId],
    );
    expect(costState.rows[0]).toMatchObject({
      cost_source_id: purchaseItemId,
      cost_source_type: "PURCHASE_ITEM",
      cost_status: "FINAL",
      mwa_unit_cost: "10.40000000",
      pricing_reference_unit_cost: "10.40000000",
    });
    expect(
      (
        await database().query(
          `SELECT count(*)::integer AS count FROM pricing.pricing_review_items
           WHERE business_id = $1 AND product_unit_id = $2`,
          [businessId, productUnitId],
        )
      ).rows[0].count,
    ).toBe(1);

    const priceSetId = randomUUID();
    const proposalItemId = randomUUID();
    const priceVersionId = randomUUID();
    const retailTierId = randomUUID();
    const bulkTierId = randomUUID();
    const activePriceFrom = new Date(Date.now() - 1000).toISOString();
    const proposal = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "pricing.proposal.create",
      {
        items: [
          {
            calculated_margin: "0.30666667",
            current_price_snapshot: null,
            minimum_margin_snapshot: "0.20000000",
            pricing_reference_cost_snapshot: "10.40000000",
            product_unit_id: productUnitId,
            proposal_item_id: proposalItemId,
            proposed_price: "15.0000",
            recommended_price: "15.0000",
            risk_level: "LOW",
            target_margin_snapshot: "0.30000000",
          },
        ],
        name: "Gate D",
        notes: null,
        price_set_id: priceSetId,
        source_type: "PURCHASE_COST_CHANGE",
      },
    );
    expect(proposal.status).toBe("DRAFT");
    const approved = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "pricing.proposal.approve",
      {
        effective_from: activePriceFrom,
        expected_version: 1,
        items: [
          {
            final_approved_price: "15.0000",
            price_version_id: priceVersionId,
            proposal_item_id: proposalItemId,
            tiers: [
              {
                min_qty: "1.000000",
                sort_order: 0,
                tier_code: "RETAIL",
                tier_id: retailTierId,
                unit_price: "15.0000",
              },
              {
                min_qty: "10.000000",
                sort_order: 1,
                tier_code: "BULK",
                tier_id: bulkTierId,
                unit_price: "14.0000",
              },
            ],
          },
        ],
        owner_reason: null,
        price_set_id: priceSetId,
      },
    );
    expect(approved.status).toBe("ACTIVE");
    expect(approved.published_versions[0]).toMatchObject({
      effective_from: activePriceFrom,
      effective_to: null,
      price_version_id: priceVersionId,
      product_unit_id: productUnitId,
      status: "ACTIVE",
      unit_price: "15",
    });
    expect(approved.published_versions[0].created_at).toEqual(expect.any(String));
    expect(approved.published_versions[0].tiers).toEqual([
      {
        id: retailTierId,
        min_qty: "1",
        price_version_id: priceVersionId,
        sort_order: 0,
        tier_code: "RETAIL",
        unit_price: "15",
      },
      {
        id: bulkTierId,
        min_qty: "10",
        price_version_id: priceVersionId,
        sort_order: 1,
        tier_code: "BULK",
        unit_price: "14",
      },
    ]);

    const scheduledPriceSetId = randomUUID();
    const scheduledProposalItemId = randomUUID();
    const scheduledPriceVersionId = randomUUID();
    const scheduledRetailTierId = randomUUID();
    const scheduledFrom = new Date(Date.now() + 86_400_000).toISOString();
    await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "pricing.proposal.create",
      {
        items: [
          {
            calculated_margin: "0.35000000",
            current_price_snapshot: "15.0000",
            minimum_margin_snapshot: "0.20000000",
            pricing_reference_cost_snapshot: "10.40000000",
            product_unit_id: productUnitId,
            proposal_item_id: scheduledProposalItemId,
            proposed_price: "16.0000",
            recommended_price: "16.0000",
            risk_level: "LOW",
            target_margin_snapshot: "0.30000000",
          },
        ],
        name: "Gate D scheduled",
        notes: null,
        price_set_id: scheduledPriceSetId,
        source_type: "OWNER_SCHEDULE",
      },
    );
    const scheduledApproved = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "pricing.proposal.approve",
      {
        effective_from: scheduledFrom,
        expected_version: 1,
        items: [
          {
            final_approved_price: "16.0000",
            price_version_id: scheduledPriceVersionId,
            proposal_item_id: scheduledProposalItemId,
            tiers: [
              {
                min_qty: "1.000000",
                sort_order: 0,
                tier_code: "RETAIL",
                tier_id: scheduledRetailTierId,
                unit_price: "16.0000",
              },
            ],
          },
        ],
        owner_reason: null,
        price_set_id: scheduledPriceSetId,
      },
    );
    expect(scheduledApproved.status).toBe("SCHEDULED");

    const promotionId = randomUUID();
    const promotionCommandIdentity = {
      command_id: randomUUID(),
      correlation_id: randomUUID(),
      occurred_at: new Date().toISOString(),
    };
    const promotionPayload = {
      effective_from: new Date(Date.now() - 1000).toISOString(),
      effective_to: new Date(Date.now() + 3_600_000).toISOString(),
      min_qty: "10.000000",
      name: "Gate D bulk promo",
      owner_reason: "Campaign approved",
      priority: 10,
      product_unit_id: productUnitId,
      promotion_id: promotionId,
      promotion_type: "FIXED_DISCOUNT",
      value: "1.0000",
    };
    const promotion = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "pricing.promotion.publish",
      promotionPayload,
      promotionCommandIdentity,
    );
    expect(promotion).toMatchObject({
      min_qty: "10",
      priority: 10,
      product_unit_id: productUnitId,
      promotion_id: promotionId,
      promotion_type: "FIXED_DISCOUNT",
      replayed: false,
      status: "ACTIVE",
      value: "1",
      version: "1",
    });
    const replayedPromotion = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "pricing.promotion.publish",
      promotionPayload,
      promotionCommandIdentity,
    );
    expect(replayedPromotion.replayed).toBe(true);
    expect(
      (
        await database().query(
          `SELECT count(*)::integer AS count FROM pricing.promotions WHERE id = $1`,
          [promotionId],
        )
      ).rows[0].count,
    ).toBe(1);

    const offlinePromotionId = randomUUID();
    const offlinePromotionResponse = await handleRequest(
      new Request("https://api.kastur.test/api/v1/sync/push", {
        body: JSON.stringify({
          batch_id: randomUUID(),
          client_schema_version: 1,
          commands: [
            {
              authorization_version: authorizationVersion,
              command_id: randomUUID(),
              command_type: "pricing.promotion.publish",
              correlation_id: randomUUID(),
              device_id: deviceId,
              location_id: locationId,
              occurred_at: new Date().toISOString(),
              payload: { ...promotionPayload, promotion_id: offlinePromotionId },
              schema_version: 1,
            },
          ],
        }),
        headers: {
          authorization: `Bearer ${sessionSecret}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
      { DATABASE_URL: databaseUrl() },
    );
    expect(offlinePromotionResponse.status).toBe(200);
    expect(await offlinePromotionResponse.json()).toMatchObject({
      results: [
        {
          error: { code: "ONLINE_REQUIRED" },
          status: "REJECTED_CONFLICT",
        },
      ],
    });

    const scheduledPromotionId = randomUUID();
    await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "pricing.promotion.publish",
      {
        effective_from: new Date(Date.now() + 7_200_000).toISOString(),
        effective_to: new Date(Date.now() + 10_800_000).toISOString(),
        min_qty: "1.000000",
        name: "Gate D scheduled promo",
        owner_reason: null,
        priority: 5,
        product_unit_id: productUnitId,
        promotion_id: scheduledPromotionId,
        promotion_type: "PERCENT_DISCOUNT",
        value: "5.0000",
      },
    );

    const bootstrapResponse = await handleRequest(
      new Request(
        `https://api.kastur.test/api/v1/sync/bootstrap?terminal_id=${terminalId}`,
        { headers: { authorization: `Bearer ${sessionSecret}` } },
      ),
      { DATABASE_URL: databaseUrl() },
    );
    expect(bootstrapResponse.status).toBe(200);
    const bootstrap = /** @type {Record<string, any>} */ (await bootstrapResponse.json());
    const bootstrapPrices = /** @type {Array<Record<string, any>>} */ (
      bootstrap.published_price_versions
    );
    const bootstrapTiers = /** @type {Array<Record<string, any>>} */ (
      bootstrap.published_price_tiers
    );
    const bootstrapPromotions = /** @type {Array<Record<string, any>>} */ (
      bootstrap.promotions
    );
    expect(
      bootstrapPrices.map((row) => [row.price_version_id, row.status]),
    ).toEqual(
      expect.arrayContaining([
        [priceVersionId, "ACTIVE"],
        [scheduledPriceVersionId, "SCHEDULED"],
      ]),
    );
    expect(bootstrapPrices.every((row) => row.created_at)).toBe(true);
    expect(bootstrapTiers.map((row) => row.id)).toEqual(
      expect.arrayContaining([retailTierId, bulkTierId, scheduledRetailTierId]),
    );
    expect(bootstrapPromotions.map((row) => [row.promotion_id, row.status])).toEqual(
      expect.arrayContaining([
        [promotionId, "ACTIVE"],
        [scheduledPromotionId, "SCHEDULED"],
      ]),
    );
    expect(bootstrapPromotions.every((row) => row.created_at)).toBe(true);

    const pricingChanges = await database().query(
      `SELECT entity_type, payload
       FROM sync.change_feed
       WHERE business_id = $1
         AND entity_id = ANY($2::uuid[])
       ORDER BY sequence`,
      [businessId, [priceVersionId, scheduledPriceVersionId, promotionId]],
    );
    expect(pricingChanges.rows.map((row) => row.entity_type)).toEqual([
      "published_retail_price",
      "published_retail_price",
      "published_retail_price",
      "promotion",
    ]);
    expect(
      pricingChanges.rows
        .filter((row) => row.payload.price_version_id === priceVersionId)
        .at(-1).payload.effective_to,
    ).toBe(scheduledFrom);
    expect(
      pricingChanges.rows.some((row) => row.entity_type === "pricing_projection"),
    ).toBe(false);

    const pricedSaleCommandId = randomUUID();
    const pricedSaleId = randomUUID();
    const pricedSaleCorrelationId = randomUUID();
    const pricedSaleAt = new Date(Date.now() + 1000).toISOString();
    const pricedSale = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "sales.complete",
      {
        items: [
          {
            base_quantity: "10.000000",
            base_unit_price_snapshot: "15.0000",
            conversion_snapshot: "1.00000000",
            final_unit_price_snapshot: "13.0000",
            line_index: 0,
            line_total: "130.0000",
            manual_line_discount_snapshot: "0.0000",
            price_effective_from_snapshot: activePriceFrom,
            price_version_id_snapshot: priceVersionId,
            product_id: productId,
            product_name_snapshot: "Gate Product",
            product_unit_id: productUnitId,
            promotion_discount_snapshot: "1.0000",
            promotion_id: promotionId,
            promotion_type_snapshot: "FIXED_DISCOUNT",
            promotion_value_snapshot: "1.0000",
            quantity: "10.000000",
            sku_snapshot: "GATE-001",
            tax_amount_snapshot: "0.0000",
            tax_mode_snapshot: "NO_PPN",
            tax_rate_snapshot: "0.00000000",
            tier_code_snapshot: "BULK",
            tier_id_snapshot: bulkTierId,
            tier_min_qty_snapshot: "10.000000",
            tier_unit_price_snapshot: "14.0000",
            track_inventory_snapshot: true,
            transaction_discount_allocation: "0.0000",
            transaction_item_id: randomUUID(),
            unit_code_snapshot: "PCS",
            unit_name_snapshot: "Piece",
          },
        ],
        payload_version: 1,
        payments: [
          {
            amount: "130.0000",
            amount_tendered: "130.0000",
            change_amount: "0.0000",
            confirmation_type: "CASH_CONFIRMED",
            external_reference: null,
            method_code: "CASH",
            payment_id: randomUUID(),
            received_at: pricedSaleAt,
          },
        ],
        transaction: {
          authorization_version: authorizationVersion,
          business_id: businessId,
          change_amount: "0.0000",
          completed_at: pricedSaleAt,
          correlation_id: pricedSaleCorrelationId,
          created_by: ownerUserId,
          customer_id: null,
          device_id: deviceId,
          grand_total: "130.0000",
          line_discount_total: "0.0000",
          location_id: locationId,
          occurred_at: pricedSaleAt,
          promotion_discount_total: "10.0000",
          shift_id: shiftId,
          subtotal: "140.0000",
          tax_total: "0.0000",
          terminal_id: terminalId,
          total_paid: "130.0000",
          transaction_discount_total: "0.0000",
          transaction_id: pricedSaleId,
          transaction_number: `TRX-PRICED-${pricedSaleId.slice(0, 8)}`,
        },
      },
      {
        command_id: pricedSaleCommandId,
        correlation_id: pricedSaleCorrelationId,
        occurred_at: pricedSaleAt,
      },
    );
    expect(pricedSale).toMatchObject({
      cost_status: "PROVISIONAL",
      status: "COMPLETED",
      transaction_id: pricedSaleId,
      warnings: [],
    });
    const pricedSnapshots = await database().query(
      `SELECT ti.base_unit_price_snapshot::text, ti.tier_id_snapshot,
              ti.tier_min_qty_snapshot::text, ti.tier_unit_price_snapshot::text,
              ti.promotion_id, ti.promotion_type_snapshot,
              ti.promotion_value_snapshot::text,
              ti.promotion_discount_snapshot::text,
              ti.final_unit_price_snapshot::text, ti.cost_status,
              sm.base_quantity_delta::text, sm.id AS movement_id
       FROM sales.transaction_items ti
       JOIN inventory.stock_movements sm
         ON sm.source_type = 'SALE_TRANSACTION'
        AND sm.source_id = ti.transaction_id
        AND sm.source_line_id = ti.id
       WHERE ti.transaction_id = $1`,
      [pricedSaleId],
    );
    expect(pricedSnapshots.rows[0]).toEqual({
      base_quantity_delta: "-10.000000",
      base_unit_price_snapshot: "15.0000",
      cost_status: "PROVISIONAL",
      final_unit_price_snapshot: "13.0000",
      promotion_discount_snapshot: "1.0000",
      promotion_id: promotionId,
      promotion_type_snapshot: "FIXED_DISCOUNT",
      promotion_value_snapshot: "1.0000",
      tier_id_snapshot: bulkTierId,
      tier_min_qty_snapshot: "10.000000",
      tier_unit_price_snapshot: "14.0000",
      movement_id: expect.any(String),
    });

    const adjustment = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.adjust",
      {
        adjustment_id: randomUUID(),
        adjustment_number: `ADJ-${randomUUID().slice(0, 8)}`,
        direction: "OUT",
        items: [
          {
            conversion_snapshot: "1.00000000",
            item_id: randomUUID(),
            product_id: productId,
            product_unit_id: productUnitId,
            quantity: "1.000000",
          },
        ],
        notes: "Damaged",
        reason_code: "DAMAGED",
      },
    );
    expect(adjustment.movements[0].base_quantity_delta).toBe("-1");

    const opnameId = randomUUID();
    await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.opname.create",
      {
        opname_id: opnameId,
        opname_number: `OPN-${opnameId.slice(0, 8)}`,
        product_ids: [productId],
        scope_type: "SELECTED",
      },
    );
    await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.opname.count",
      {
        expected_version: 1,
        items: [
          {
            counted_at: new Date(Date.now() + 1000).toISOString(),
            physical_qty: "3.000000",
            product_id: productId,
          },
        ],
        opname_id: opnameId,
      },
    );
    const review = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.opname.review",
      { expected_version: 2, notes: null, opname_id: opnameId },
    );
    expect(review.recount_required_count).toBe("0");
    const opname = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.opname.post",
      { expected_version: 3, notes: "Approved variance", opname_id: opnameId },
    );
    expect(opname.movements[0].base_quantity_delta).toBe("9");
    const opnameSnapshot = await database().query(
      `SELECT system_qty_at_count::text, physical_qty::text, variance_qty::text,
              count_movement_sequence::text
       FROM inventory.opname_items
       WHERE opname_session_id = $1 AND product_id = $2`,
      [opnameId, productId],
    );
    expect(opnameSnapshot.rows[0]).toMatchObject({
      physical_qty: "3.000000",
      system_qty_at_count: "-6.000000",
      variance_qty: "9.000000",
    });
    expect(BigInt(opnameSnapshot.rows[0].count_movement_sequence)).toBeGreaterThan(0n);

    const saleBefore = (
      await database().query(
        `SELECT to_jsonb(t.*) AS snapshot FROM sales.transactions t WHERE id = $1`,
        [saleId],
      )
    ).rows[0].snapshot;
    const crossDeviceLookup = await returnSaleQuery(
      lookupSessionSecret,
      lookupDeviceId,
      lookupTerminalId,
      `/api/v1/returns/sales?q=${saleId}`,
    );
    expect(crossDeviceLookup.status).toBe(200);
    expect(crossDeviceLookup.body.data).toHaveLength(1);
    expect(crossDeviceLookup.body.data[0]).toMatchObject({
      transaction: {
        terminal_id: terminalId,
        transaction_id: saleId,
        transaction_number: "TRX-GATES",
      },
      items: [{
        remaining_returnable_qty: "2.000000",
        transaction_item_id: saleItemId,
      }],
      payments: [{ payment_id: salePaymentId }],
    });
    expect(JSON.stringify(crossDeviceLookup.body.data)).not.toMatch(/cost|margin/iu);
    const crossDeviceDetail = await returnSaleQuery(
      lookupSessionSecret,
      lookupDeviceId,
      lookupTerminalId,
      `/api/v1/returns/sales/${saleId}`,
    );
    expect(crossDeviceDetail).toMatchObject({
      body: { data: { transaction: { transaction_id: saleId } } },
      status: 200,
    });
    const firstReturnAt = new Date().toISOString();
    const firstReturnIdentity = {
      command_id: randomUUID(),
      correlation_id: randomUUID(),
      occurred_at: firstReturnAt,
    };
    const firstReturnPayload = {
      items: [
        {
          condition_notes: "Opened",
          conversion_snapshot: "1.00000000",
          disposition: "NOT_RESTOCKED",
          original_transaction_item_id: saleItemId,
          product_id: productId,
          product_unit_id: productUnitId,
          reason_code: "DAMAGED",
          return_item_id: randomUUID(),
          return_qty: "1.000000",
        },
      ],
      notes: "Provider refund pending",
      occurred_at: firstReturnAt,
      original_transaction_id: saleId,
      receipt_mode: "TRANSACTION_LINKED",
      refund: {
        amount: "15.0000",
        external_reference: `card-refund-${randomUUID()}`,
        original_payment_id: salePaymentId,
        override_amount: false,
        override_method: false,
        override_reason: null,
        payment_method_id: cardMethodId,
        refund_id: randomUUID(),
        refund_number: `RFD-${randomUUID().slice(0, 8)}`,
      },
      return_id: randomUUID(),
      return_number: `RET-${randomUUID().slice(0, 8)}`,
      return_type: "PARTIAL",
      shift_id: shiftId,
      terminal_id: terminalId,
    };
    const expiredReturnId = randomUUID();
    const expiredPayload = {
      ...firstReturnPayload,
      items: [{
        ...firstReturnPayload.items[0],
        original_transaction_item_id: expiredSaleItemId,
        return_item_id: randomUUID(),
      }],
      original_transaction_id: expiredSaleId,
      refund: {
        ...firstReturnPayload.refund,
        external_reference: `expired-${randomUUID()}`,
        original_payment_id: expiredSalePaymentId,
        refund_id: randomUUID(),
        refund_number: `RFD-${randomUUID().slice(0, 8)}`,
      },
      return_id: expiredReturnId,
      return_number: `RET-${randomUUID().slice(0, 8)}`,
    };
    const expired = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.complete",
      expiredPayload,
    );
    expect(expired.status).toBe(409);
    expect(expired.body.error.code).toBe("RETURN_WINDOW_EXPIRED");
    const missingWindowReason = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.complete",
      { ...expiredPayload, override_window: true },
    );
    expect(missingWindowReason.status).toBe(400);
    expect(missingWindowReason.body.error.code).toBe("RETURN_WINDOW_OVERRIDE_REASON_REQUIRED");

    const windowOverrideId = randomUUID();
    await database().query(
      `INSERT INTO identity.permission_overrides (
         id, membership_id, permission_id, effect, reason, created_by
       ) VALUES ($1, $2, '44444444-4444-4444-8444-000000000089', 'REVOKE',
                 'Gate F permission test', $3)`,
      [windowOverrideId, membershipId, ownerUserId],
    );
    const deniedWindowOverride = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.complete",
      {
        ...expiredPayload,
        override_window: true,
        window_override_reason: "Owner exception",
      },
    );
    expect(deniedWindowOverride.status).toBe(403);
    expect(deniedWindowOverride.body.error.code).toBe("PERMISSION_DENIED");
    expect((await database().query(
      `SELECT count(*)::integer AS count
       FROM returns.customer_returns WHERE id = $1`,
      [expiredReturnId],
    )).rows[0].count).toBe(0);
    await database().query(
      `DELETE FROM identity.permission_overrides WHERE id = $1`,
      [windowOverrideId],
    );

    const firstReturn = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.complete",
      firstReturnPayload,
      firstReturnIdentity,
    );
    expect(firstReturn).toMatchObject({
      refund_record_status: "PENDING",
      refund_status: "PENDING",
      replayed: false,
      return_status: "COMPLETED",
    });
    expect(firstReturn.stock_movements).toHaveLength(0);
    const replayedReturn = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.complete",
      firstReturnPayload,
      firstReturnIdentity,
    );
    expect(replayedReturn).toMatchObject({
      refund_status: "PENDING",
      replayed: true,
      return_id: firstReturnPayload.return_id,
    });

    const afterFirstReturnLookup = await returnSaleQuery(
      lookupSessionSecret,
      lookupDeviceId,
      lookupTerminalId,
      `/api/v1/returns/sales/${saleId}`,
    );
    expect(afterFirstReturnLookup.body.data.items[0].remaining_returnable_qty).toBe("1.000000");

    /**
     * @param {string} refundRecordStatus
     * @param {string} refundVersion
     * @param {string} refundStatus
     */
    async function expectRefundVisible(refundRecordStatus, refundVersion, refundStatus) {
      const returnsResource = await backofficeResource(sessionSecret, "returns");
      const visibleReturn = returnsResource.items.find(
        (/** @type {Record<string, unknown>} */ item) => item.id === firstReturnPayload.return_id,
      );
      expect(visibleReturn).toMatchObject({
        refund_id: firstReturnPayload.refund.refund_id,
        refund_record_status: refundRecordStatus,
        refund_status: refundStatus,
        refund_version: refundVersion,
      });
    }
    await expectRefundVisible("PENDING", "1", "PENDING");

    const failedIdentity = {
      command_id: randomUUID(),
      correlation_id: randomUUID(),
      occurred_at: new Date().toISOString(),
    };
    const failedPayload = {
      expected_version: 1,
      external_reference: firstReturnPayload.refund.external_reference,
      reason: "Provider menyatakan refund gagal",
      refund_id: firstReturnPayload.refund.refund_id,
      resolution_status: "FAILED",
    };
    const failedRefund = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.resolve",
      failedPayload,
      failedIdentity,
    );
    expect(failedRefund).toMatchObject({
      refund_record_status: "FAILED",
      replayed: false,
      return_refund_status: "PENDING",
      version: "2",
      warnings: ["REFUND_FAILED_OUTSTANDING"],
    });
    await expectRefundVisible("FAILED", "2", "PENDING");
    expect(await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.resolve",
      failedPayload,
      failedIdentity,
    )).toMatchObject({ replayed: true, version: "2" });

    const missingRetryReason = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.retry",
      {
        expected_version: 2,
        reason: " ",
        refund_id: firstReturnPayload.refund.refund_id,
      },
    );
    expect(missingRetryReason).toMatchObject({
      body: { error: { code: "REFUND_REASON_REQUIRED" } },
      status: 400,
    });

    const retryIdentity = {
      command_id: randomUUID(),
      correlation_id: randomUUID(),
      occurred_at: new Date().toISOString(),
    };
    const retryPayload = {
      expected_version: 2,
      reason: "Coba ulang setelah kegagalan provider",
      refund_id: firstReturnPayload.refund.refund_id,
    };
    const retriedRefund = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.retry",
      retryPayload,
      retryIdentity,
    );
    expect(retriedRefund).toMatchObject({
      refund_record_status: "PENDING",
      version: "3",
      warnings: ["REFUND_RETRY_PENDING"],
    });
    await expectRefundVisible("PENDING", "3", "PENDING");
    expect(await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.retry",
      retryPayload,
      retryIdentity,
    )).toMatchObject({ replayed: true, version: "3" });

    const requiresAction = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.resolve",
      {
        expected_version: 3,
        external_reference: firstReturnPayload.refund.external_reference,
        reason: "Provider meminta verifikasi manual",
        refund_id: firstReturnPayload.refund.refund_id,
        resolution_status: "REQUIRES_ACTION",
      },
    );
    expect(requiresAction).toMatchObject({
      refund_record_status: "REQUIRES_ACTION",
      version: "4",
    });
    await expectRefundVisible("REQUIRES_ACTION", "4", "PENDING");

    await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.retry",
      {
        expected_version: 4,
        reason: "Verifikasi manual selesai; coba ulang",
        refund_id: firstReturnPayload.refund.refund_id,
      },
    );
    await expectRefundVisible("PENDING", "5", "PENDING");

    const completedRefund = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.resolve",
      {
        expected_version: 5,
        external_reference: firstReturnPayload.refund.external_reference,
        reason: "Provider mengonfirmasi settlement",
        refund_id: firstReturnPayload.refund.refund_id,
        resolution_status: "COMPLETED",
      },
    );
    expect(completedRefund).toMatchObject({
      cash_movement_id: null,
      refund_record_status: "COMPLETED",
      return_refund_status: "COMPLETED",
      version: "6",
      warnings: [],
    });
    await expectRefundVisible("COMPLETED", "6", "COMPLETED");

    const reversePermissionOverrideId = randomUUID();
    await database().query(
      `INSERT INTO identity.permission_overrides (
         id, membership_id, permission_id, effect, reason, created_by
       ) VALUES ($1, $2, '44444444-4444-4444-8444-000000000094', 'REVOKE',
                 'Gate F reversal permission proof', $3)`,
      [reversePermissionOverrideId, membershipId, ownerUserId],
    );
    const deniedReverse = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.reverse",
      {
        expected_version: 6,
        reason: "Tidak berwenang",
        refund_id: firstReturnPayload.refund.refund_id,
      },
    );
    expect(deniedReverse).toMatchObject({
      body: { error: { code: "PERMISSION_DENIED" } },
      status: 403,
    });
    await database().query(
      `DELETE FROM identity.permission_overrides WHERE id = $1`,
      [reversePermissionOverrideId],
    );

    const staleLifecycle = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.retry",
      {
        expected_version: 5,
        reason: "Versi lama",
        refund_id: firstReturnPayload.refund.refund_id,
      },
    );
    expect(staleLifecycle).toMatchObject({
      body: { error: { code: "REFUND_VERSION_CONFLICT" } },
      status: 409,
    });

    const reversedRefund = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.reverse",
      {
        expected_version: 6,
        reason: "Settlement provider dibatalkan secara terverifikasi",
        refund_id: firstReturnPayload.refund.refund_id,
      },
    );
    expect(reversedRefund).toMatchObject({
      cash_movement_id: null,
      refund_record_status: "REVERSED",
      return_refund_status: "NONE",
      version: "7",
    });
    await expectRefundVisible("REVERSED", "7", "NONE");
    expect((await database().query(
      `SELECT count(*)::integer AS count
       FROM returns.refund_lifecycle_events WHERE refund_id = $1`,
      [firstReturnPayload.refund.refund_id],
    )).rows[0].count).toBe(6);

    const dispositionOverrideId = randomUUID();
    const dispositionReturnId = randomUUID();
    const dispositionPayload = {
      ...firstReturnPayload,
      items: [{
        ...firstReturnPayload.items[0],
        disposition: "RESTOCK",
        disposition_override: true,
        disposition_override_reason: "Kemasan telah terbuka",
        reason_code: "OTHER",
        return_item_id: randomUUID(),
      }],
      refund: {
        ...firstReturnPayload.refund,
        external_reference: `disposition-${randomUUID()}`,
        refund_id: randomUUID(),
        refund_number: `RFD-${randomUUID().slice(0, 8)}`,
      },
      return_id: dispositionReturnId,
      return_number: `RET-${randomUUID().slice(0, 8)}`,
    };
    await database().query(
      `INSERT INTO identity.permission_overrides (
         id, membership_id, permission_id, effect, reason, created_by
       ) VALUES ($1, $2, '44444444-4444-4444-8444-000000000091', 'REVOKE',
                 'Gate F permission test', $3)`,
      [dispositionOverrideId, membershipId, ownerUserId],
    );
    const deniedDisposition = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.complete",
      dispositionPayload,
    );
    expect(deniedDisposition.status).toBe(403);
    expect(deniedDisposition.body.error.code).toBe("PERMISSION_DENIED");
    expect((await database().query(
      `SELECT count(*)::integer AS count
       FROM returns.customer_returns WHERE id = $1`,
      [dispositionReturnId],
    )).rows[0].count).toBe(0);
    await database().query(
      `DELETE FROM identity.permission_overrides WHERE id = $1`,
      [dispositionOverrideId],
    );

    const rejected = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.complete",
      {
        items: [
          {
            condition_notes: null,
            conversion_snapshot: "1.00000000",
            disposition: "RESTOCK",
            disposition_override: true,
            disposition_override_reason: "Inspected and suitable for resale",
            original_transaction_item_id: saleItemId,
            product_id: productId,
            product_unit_id: productUnitId,
            reason_code: "OTHER",
            return_item_id: randomUUID(),
            return_qty: "2.000000",
          },
        ],
        notes: null,
        occurred_at: new Date().toISOString(),
        original_transaction_id: saleId,
        receipt_mode: "TRANSACTION_LINKED",
        refund: {
          amount: "30.0000",
          external_reference: null,
          original_payment_id: salePaymentId,
          override_amount: false,
          override_method: false,
          override_reason: null,
          payment_method_id: cardMethodId,
          refund_id: randomUUID(),
          refund_number: `RFD-${randomUUID().slice(0, 8)}`,
        },
        return_id: randomUUID(),
        return_number: `RET-${randomUUID().slice(0, 8)}`,
        return_type: "FULL",
        shift_id: shiftId,
        terminal_id: terminalId,
      },
    );
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe("RETURN_QUANTITY_CONFLICT");

    const secondReturnItemId = randomUUID();
    const secondRefundId = randomUUID();
    const secondReturn = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.complete",
      {
        items: [
          {
            condition_notes: "Sealed",
            conversion_snapshot: "1.00000000",
            disposition: "RESTOCK",
            disposition_override: true,
            disposition_override_reason: "Sealed and inspected",
            original_transaction_item_id: saleItemId,
            product_id: productId,
            product_unit_id: productUnitId,
            reason_code: "OTHER",
            return_item_id: secondReturnItemId,
            return_qty: "1.000000",
          },
        ],
        notes: "Cash override",
        occurred_at: new Date().toISOString(),
        original_transaction_id: saleId,
        receipt_mode: "TRANSACTION_LINKED",
        refund: {
          amount: "15.0000",
          external_reference: null,
          original_payment_id: salePaymentId,
          override_amount: false,
          override_method: true,
          override_reason: "Customer requested cash; Owner approved",
          payment_method_id: cashMethodId,
          refund_id: secondRefundId,
          refund_number: `RFD-${randomUUID().slice(0, 8)}`,
        },
        return_id: randomUUID(),
        return_number: `RET-${randomUUID().slice(0, 8)}`,
        return_type: "PARTIAL",
        shift_id: shiftId,
        terminal_id: terminalId,
      },
    );
    expect(secondReturn).toMatchObject({ refund_status: "COMPLETED", return_status: "COMPLETED" });
    expect(secondReturn.stock_movements).toHaveLength(1);
    expect((await database().query(
      `SELECT cost_status, cost_source_type, cost_source_id
       FROM costing.product_cost_states
       WHERE business_id = $1 AND location_id = $2 AND product_id = $3`,
      [businessId, locationId, productId],
    )).rows[0]).toMatchObject({
      cost_source_id: secondReturnItemId,
      cost_source_type: "CUSTOMER_RETURN_ITEM",
      cost_status: "FINAL",
    });
    const missingCashContext = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.reverse",
      {
        expected_version: 1,
        reason: "Cash Refund correction without Shift",
        refund_id: secondRefundId,
      },
    );
    expect(missingCashContext).toMatchObject({
      body: { error: { code: "REFUND_CASH_SHIFT_REQUIRED" } },
      status: 409,
    });
    expect((await database().query(
      `SELECT status, version::text FROM returns.refunds WHERE id = $1`,
      [secondRefundId],
    )).rows[0]).toEqual({ status: "COMPLETED", version: "1" });
    const cashReversal = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.reverse",
      {
        expected_version: 1,
        reason: "Cash Refund correction disetujui Owner",
        refund_id: secondRefundId,
        shift_id: shiftId,
        terminal_id: terminalId,
      },
    );
    expect(cashReversal).toMatchObject({
      cash_movement_id: expect.any(String),
      refund_record_status: "REVERSED",
      return_refund_status: "NONE",
      version: "2",
    });

    // A failed Refund does not reserve money. Recovery must re-check both the
    // immutable Return value and the original Payment after acquiring the same
    // Payment lock used by a newly completed Return.
    const returnCapacityReturnId = randomUUID();
    const returnCapacityFailedRefundId = randomUUID();
    await database().query(
      `INSERT INTO returns.customer_returns (
         id, business_id, location_id, return_number, original_transaction_id,
         status, refund_status, return_total, refunded_total, reason_code,
         created_by, processed_by, occurred_at, correlation_id, created_at,
         completed_at, version, return_type, receipt_mode, risk_level,
         return_window_days_snapshot, return_age_days, window_override
       ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', 'NONE', 15, 0, 'OTHER',
                 $6, $6, CURRENT_TIMESTAMP, $7, CURRENT_TIMESTAMP,
                 CURRENT_TIMESTAMP, 1, 'PARTIAL', 'TRANSACTION_LINKED',
                 'STANDARD', 7, 0, FALSE)`,
      [
        returnCapacityReturnId,
        businessId,
        locationId,
        `RET-CAP-${randomUUID().slice(0, 8)}`,
        saleId,
        ownerUserId,
        randomUUID(),
      ],
    );
    await database().query(
      `INSERT INTO returns.refunds (
         id, customer_return_id, business_id, location_id, amount,
         payment_method_id, status, processed_at, processed_by, created_at,
         version, original_payment_id, refund_number, device_id, requested_at,
         failed_at, correlation_id
       ) VALUES
         ($1, $3, $4, $5, 10, $6, 'FAILED', CURRENT_TIMESTAMP, $7,
          CURRENT_TIMESTAMP, 1, $8, $9, $10, CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP, $11),
         ($2, $3, $4, $5, 10, $6, 'PENDING', NULL, NULL,
          CURRENT_TIMESTAMP, 1, $8, $12, $10, CURRENT_TIMESTAMP,
          NULL, $13)`,
      [
        returnCapacityFailedRefundId,
        randomUUID(),
        returnCapacityReturnId,
        businessId,
        locationId,
        cardMethodId,
        ownerUserId,
        salePaymentId,
        `RFD-CAP-${randomUUID().slice(0, 8)}`,
        deviceId,
        randomUUID(),
        `RFD-CAP-${randomUUID().slice(0, 8)}`,
        randomUUID(),
      ],
    );
    const returnCapacityRejected = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.retry",
      {
        expected_version: 1,
        reason: "Must not exceed immutable Return value",
        refund_id: returnCapacityFailedRefundId,
      },
    );
    expect(returnCapacityRejected).toMatchObject({
      body: { error: { code: "REFUND_RETURN_LIMIT_EXCEEDED" } },
      status: 409,
    });
    await expect(database().query(
      `UPDATE returns.refunds
       SET status = 'PENDING', processed_at = CURRENT_TIMESTAMP,
           processed_by = $2, failed_at = NULL, version = 2
       WHERE id = $1`,
      [returnCapacityFailedRefundId, ownerUserId],
    )).rejects.toMatchObject({ code: "23514" });

    const paymentCapacityReturnId = randomUUID();
    const paymentCapacityFailedRefundId = randomUUID();
    await database().query(
      `INSERT INTO returns.customer_returns (
         id, business_id, location_id, return_number, original_transaction_id,
         status, refund_status, return_total, refunded_total, reason_code,
         created_by, processed_by, occurred_at, correlation_id, created_at,
         completed_at, version, return_type, receipt_mode, risk_level,
         return_window_days_snapshot, return_age_days, window_override
       ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', 'NONE', 30, 0, 'OTHER',
                 $6, $6, CURRENT_TIMESTAMP, $7, CURRENT_TIMESTAMP,
                 CURRENT_TIMESTAMP, 1, 'PARTIAL', 'TRANSACTION_LINKED',
                 'STANDARD', 7, 0, FALSE)`,
      [
        paymentCapacityReturnId,
        businessId,
        locationId,
        `RET-PAY-CAP-${randomUUID().slice(0, 8)}`,
        saleId,
        ownerUserId,
        randomUUID(),
      ],
    );
    await database().query(
      `INSERT INTO returns.refunds (
         id, customer_return_id, business_id, location_id, amount,
         payment_method_id, status, processed_at, processed_by, created_at,
         version, original_payment_id, refund_number, device_id, requested_at,
         failed_at, correlation_id
       ) VALUES
         ($1, $3, $4, $5, 10, $6, 'FAILED', CURRENT_TIMESTAMP, $7,
          CURRENT_TIMESTAMP, 1, $8, $9, $10, CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP, $11),
         ($2, $3, $4, $5, 15, $6, 'PENDING', NULL, NULL,
          CURRENT_TIMESTAMP, 1, $8, $12, $10, CURRENT_TIMESTAMP,
          NULL, $13)`,
      [
        paymentCapacityFailedRefundId,
        randomUUID(),
        paymentCapacityReturnId,
        businessId,
        locationId,
        cardMethodId,
        ownerUserId,
        salePaymentId,
        `RFD-PAY-CAP-${randomUUID().slice(0, 8)}`,
        deviceId,
        randomUUID(),
        `RFD-PAY-CAP-${randomUUID().slice(0, 8)}`,
        randomUUID(),
      ],
    );
    const paymentCapacityRejected = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.retry",
      {
        expected_version: 1,
        reason: "Must not exceed original Payment",
        refund_id: paymentCapacityFailedRefundId,
      },
    );
    expect(paymentCapacityRejected).toMatchObject({
      body: { error: { code: "REFUND_PAYMENT_LIMIT_EXCEEDED" } },
      status: 409,
    });
    const duplicateProviderReference = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "returns.refund.resolve",
      {
        expected_version: 1,
        external_reference: firstReturnPayload.refund.external_reference,
        reason: "Provider reference must remain unique",
        refund_id: paymentCapacityFailedRefundId,
        resolution_status: "COMPLETED",
      },
    );
    expect(duplicateProviderReference).toMatchObject({
      body: { error: { code: "REFUND_EXTERNAL_REFERENCE_CONFLICT" } },
      status: 409,
    });

    const finalBalance = await database().query(
      `SELECT base_quantity::text FROM inventory.stock_balances
       WHERE business_id = $1 AND location_id = $2 AND product_id = $3`,
      [businessId, locationId, productId],
    );
    expect(finalBalance.rows[0].base_quantity).toBe("4.000000");
    const projectedMovements = [
      [receipt.stock_movements[0]?.id, "5.000000"],
      [pricedSnapshots.rows[0]?.movement_id, "-5.000000"],
      [adjustment.movements[0]?.id, "-6.000000"],
      [opname.movements[0]?.id, "3.000000"],
      [secondReturn.stock_movements[0]?.id, "4.000000"],
    ];
    /** @type {Map<string, string>} */
    const expectedBalances = new Map();
    for (const [movementId, expectedBalance] of projectedMovements) {
      if (typeof movementId !== "string" || typeof expectedBalance !== "string") {
        throw new Error("Stock projection fixture is invalid.");
      }
      expectedBalances.set(movementId, expectedBalance);
    }
    const stockProjectionRows = await database().query(
      `SELECT payload
       FROM sync.change_feed
       WHERE business_id = $1 AND entity_type = 'stock_balance'
         AND payload->>'last_movement_id' = ANY($2::text[])`,
      [businessId, [...expectedBalances.keys()]],
    );
    expect(stockProjectionRows.rows).toHaveLength(expectedBalances.size);
    for (const row of stockProjectionRows.rows) {
      expect(row.payload).toMatchObject({
        base_quantity: expectedBalances.get(row.payload.last_movement_id),
        business_id: businessId,
        location_id: locationId,
        product_id: productId,
        updated_at: expect.any(String),
      });
      expect(row.payload).not.toHaveProperty("mwa_unit_cost");
      expect(row.payload).not.toHaveProperty("provisional_unit_cost");
    }
    expect(
      (
        await database().query(
          `SELECT count(*)::integer AS count FROM cash.cash_movements
           WHERE business_id = $1 AND movement_type = 'CASH_REFUND'`,
          [businessId],
        )
      ).rows[0].count,
    ).toBe(1);
    expect((await database().query(
      `SELECT count(*)::integer AS count
       FROM cash.cash_movements
       WHERE business_id = $1 AND movement_type = 'CASH_REVERSAL'
         AND direction = 'IN' AND shift_id = $2`,
      [businessId, shiftId],
    )).rows[0].count).toBe(1);
    const saleAfter = (
      await database().query(
        `SELECT to_jsonb(t.*) AS snapshot FROM sales.transactions t WHERE id = $1`,
        [saleId],
      )
    ).rows[0].snapshot;
    expect(saleAfter).toEqual(saleBefore);
    await expect(database().query(
      `UPDATE sales.transactions SET status = 'VOIDED' WHERE id = $1`,
      [saleId],
    )).rejects.toMatchObject({ code: "55000" });
    await expect(database().query(
      `UPDATE sales.payments SET amount = amount + 1 WHERE id = $1`,
      [salePaymentId],
    )).rejects.toMatchObject({ code: "55000" });
    await expect(database().query(
      `UPDATE returns.return_items SET return_qty = return_qty + 1 WHERE id = $1`,
      [firstReturnPayload.items[0]?.return_item_id],
    )).rejects.toMatchObject({ code: "55000" });
    await expect(database().query(
      `UPDATE returns.customer_returns SET notes = 'mutated' WHERE id = $1`,
      [firstReturnPayload.return_id],
    )).rejects.toMatchObject({ code: "55000" });
    await expect(database().query(
      `UPDATE returns.customer_returns SET refund_status = 'PENDING' WHERE id = $1`,
      [firstReturnPayload.return_id],
    )).rejects.toMatchObject({ code: "55000" });
    await expect(database().query(
      `UPDATE returns.refunds SET amount = amount + 1, version = version + 1 WHERE id = $1`,
      [firstReturnPayload.refund.refund_id],
    )).rejects.toMatchObject({ code: "55000" });
    expect(
      (
        await database().query(
          `SELECT count(*)::integer AS count FROM returns.customer_returns
           WHERE original_transaction_id = $1 AND status = 'COMPLETED'`,
          [saleId],
        )
      ).rows[0].count,
    ).toBe(2);
  }, 60_000);

  it("rejects invoice headers that do not reconcile to line facts and unsupported allocations", async () => {
    const purchaseId = randomUUID();
    const purchaseItemId = randomUUID();
    await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "purchasing.purchase.create",
      {
        items: [
          {
            agreed_discount_amount: "0.0000",
            agreed_free_qty: "0.000000",
            agreed_unit_price: "10.0000",
            conversion_snapshot: "1.00000000",
            expected_qty: "1.000000",
            item_id: purchaseItemId,
            product_id: productId,
            product_unit_id: productUnitId,
          },
        ],
        notes: null,
        purchase_date: "2026-08-23",
        purchase_id: purchaseId,
        purchase_number: `PUR-HDR-${purchaseId.slice(0, 8)}`,
        supplier_id: supplierId,
      },
    );

    const capturedAt = new Date().toISOString();
    const invoiceItem = {
      free_qty: "0.000000",
      invoice_item_id: randomUUID(),
      invoiced_qty: "1.000000",
      item_discount_amount: "0.0000",
      purchase_item_id: purchaseItemId,
      tax_amount: "0.0000",
      unit_price: "10.0000",
    };
    const mismatch = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "purchasing.invoice.upsert",
      {
        acquisition_charge_total: "0.0000",
        captured_at: capturedAt,
        charges: [],
        expected_invoice_version: 0,
        expected_purchase_version: 1,
        global_discount_total: "0.0000",
        grand_total: "11.0000",
        invoice_date: "2026-08-23",
        invoice_id: randomUUID(),
        item_discount_total: "0.0000",
        items: [invoiceItem],
        purchase_id: purchaseId,
        subtotal: "11.0000",
        supplier_invoice_number: `INV-HDR-${purchaseId.slice(0, 8)}`,
        tax_total: "0.0000",
      },
    );
    expect(mismatch).toMatchObject({
      body: { error: { code: "INVOICE_SUBTOTAL_MISMATCH" } },
      status: 400,
    });

    const unsupported = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "purchasing.invoice.upsert",
      {
        acquisition_charge_total: "1.0000",
        captured_at: capturedAt,
        charges: [
          {
            allocation_method: "MANUAL",
            amount: "1.0000",
            charge_id: randomUUID(),
            description: "Unsupported",
            type: "FREIGHT",
          },
        ],
        expected_invoice_version: 0,
        expected_purchase_version: 1,
        global_discount_total: "0.0000",
        grand_total: "11.0000",
        invoice_date: "2026-08-23",
        invoice_id: randomUUID(),
        item_discount_total: "0.0000",
        items: [invoiceItem],
        purchase_id: purchaseId,
        subtotal: "10.0000",
        supplier_invoice_number: `INV-ALLOC-${purchaseId.slice(0, 8)}`,
        tax_total: "0.0000",
      },
    );
    expect(unsupported).toMatchObject({
      body: { error: { code: "PURCHASE_CHARGE_ALLOCATION_UNSUPPORTED" } },
      status: 400,
    });
    const invoiceCount = await database().query(
      `SELECT count(*)::integer AS count
       FROM purchasing.purchase_invoices
       WHERE purchase_id = $1`,
      [purchaseId],
    );
    expect(invoiceCount.rows[0].count).toBe(0);
  });

  it("allocates a negative-stock replacement FIFO and splits final value between COGS and inventory", async () => {
    const negativeProductId = randomUUID();
    const negativeUnitId = randomUUID();
    const initialCostEventId = randomUUID();
    const negativeSaleId = randomUUID();
    const negativeSaleItemId = randomUUID();
    const saleAt = new Date(Date.now() + 1000).toISOString();
    await database().query(
      `INSERT INTO catalog.products (
         id, business_id, sku, name, category_id, base_unit_code,
         track_inventory, status
       ) VALUES ($1, $2, $3, 'Negative Cost Product', $4, 'PCS', TRUE, 'ACTIVE')`,
      [negativeProductId, businessId, `NEG-${negativeProductId.slice(0, 8)}`, categoryId],
    );
    await database().query(
      `INSERT INTO catalog.product_units (
         id, business_id, product_id, unit_code, display_name, conversion_factor,
         can_sell, can_purchase, allow_decimal_qty, status
       ) VALUES ($1, $2, $3, 'PCS', 'Piece', 1, TRUE, TRUE, FALSE, 'ACTIVE')`,
      [negativeUnitId, businessId, negativeProductId],
    );
    await database().query(
      `INSERT INTO costing.cost_events (
         id, business_id, location_id, product_id, event_type, quantity_basis,
         unit_cost_before, unit_cost_after, value_delta, source_type, source_id,
         occurred_at, actor_user_id, correlation_id
       ) VALUES ($1, $2, $3, $4, 'INITIAL_COST', 1, NULL, 5, 5,
                 'OPENING_COST', $4, $5, $6, $7)`,
      [
        initialCostEventId,
        businessId,
        locationId,
        negativeProductId,
        saleAt,
        ownerUserId,
        randomUUID(),
      ],
    );
    await database().query(
      `INSERT INTO costing.product_cost_states (
         business_id, location_id, product_id, mwa_unit_cost,
         last_valid_mwa_unit_cost, latest_landed_unit_cost,
         pricing_reference_unit_cost, pricing_reference_source_type,
         pricing_reference_source_id, cost_status, cost_source_type,
         cost_source_id, last_cost_event_id, updated_at
       ) VALUES ($1, $2, $3, 5, 5, 5, 5, 'OPENING_COST', $3,
                 'FINAL', 'OPENING_COST', $3, $4, CURRENT_TIMESTAMP)`,
      [businessId, locationId, negativeProductId, initialCostEventId],
    );
    const initialStockMovementId = randomUUID();
    await database().query(
      `INSERT INTO inventory.stock_movements (
         id, business_id, location_id, product_id, movement_type,
         base_quantity_delta, source_unit_id, source_quantity,
         conversion_snapshot, source_type, source_id, occurred_at,
         actor_user_id, device_id, correlation_id
       ) VALUES ($1, $2, $3, $4, 'INITIAL_STOCK', 2, $5, 2, 1,
                 'OPENING_STOCK', $4, $6, $7, $8, $9)`,
      [
        initialStockMovementId,
        businessId,
        locationId,
        negativeProductId,
        negativeUnitId,
        new Date(new Date(saleAt).getTime() - 1000).toISOString(),
        ownerUserId,
        deviceId,
        randomUUID(),
      ],
    );
    await database().query(
      `INSERT INTO inventory.stock_balances (
         business_id, location_id, product_id, base_quantity,
         last_movement_id, updated_at
       ) VALUES ($1, $2, $3, 2, $4, CURRENT_TIMESTAMP)`,
      [businessId, locationId, negativeProductId, initialStockMovementId],
    );
    const negativePriceVersionId = randomUUID();
    const negativeRetailTierId = randomUUID();
    const negativePriceFrom = new Date(new Date(saleAt).getTime() - 2000).toISOString();
    await database().query(
      `INSERT INTO pricing.price_versions (
         id, business_id, product_unit_id, status, effective_from,
         tax_mode, tax_rate_snapshot, created_by, created_at
       ) VALUES ($1, $2, $3, 'ACTIVE', $4, 'NO_PPN', 0, $5, $4)`,
      [negativePriceVersionId, businessId, negativeUnitId, negativePriceFrom, ownerUserId],
    );
    await database().query(
      `INSERT INTO pricing.price_tier_versions (
         id, price_version_id, tier_code, min_qty, unit_price, sort_order
       ) VALUES ($1, $2, 'RETAIL', 1, 10, 0)`,
      [negativeRetailTierId, negativePriceVersionId],
    );
    const negativeSaleCorrelationId = randomUUID();
    const negativeSale = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "sales.complete",
      {
        items: [
          {
            base_quantity: "5.000000",
            base_unit_price_snapshot: "10.0000",
            conversion_snapshot: "1.00000000",
            final_unit_price_snapshot: "10.0000",
            line_index: 0,
            line_total: "50.0000",
            manual_line_discount_snapshot: "0.0000",
            price_effective_from_snapshot: negativePriceFrom,
            price_version_id_snapshot: negativePriceVersionId,
            product_id: negativeProductId,
            product_name_snapshot: "Negative Cost Product",
            product_unit_id: negativeUnitId,
            promotion_discount_snapshot: "0.0000",
            promotion_id: null,
            promotion_type_snapshot: null,
            promotion_value_snapshot: null,
            quantity: "5.000000",
            sku_snapshot: "NEG",
            tax_amount_snapshot: "0.0000",
            tax_mode_snapshot: "NO_PPN",
            tax_rate_snapshot: "0.00000000",
            tier_code_snapshot: "RETAIL",
            tier_id_snapshot: negativeRetailTierId,
            tier_min_qty_snapshot: "1.000000",
            tier_unit_price_snapshot: "10.0000",
            track_inventory_snapshot: true,
            transaction_discount_allocation: "0.0000",
            transaction_item_id: negativeSaleItemId,
            unit_code_snapshot: "PCS",
            unit_name_snapshot: "Piece",
          },
        ],
        payload_version: 1,
        payments: [
          {
            amount: "50.0000",
            amount_tendered: "50.0000",
            change_amount: "0.0000",
            confirmation_type: "CASH_CONFIRMED",
            external_reference: null,
            method_code: "CASH",
            payment_id: randomUUID(),
            received_at: saleAt,
          },
        ],
        transaction: {
          authorization_version: authorizationVersion,
          business_id: businessId,
          change_amount: "0.0000",
          completed_at: saleAt,
          correlation_id: negativeSaleCorrelationId,
          created_by: ownerUserId,
          customer_id: null,
          device_id: deviceId,
          grand_total: "50.0000",
          line_discount_total: "0.0000",
          location_id: locationId,
          occurred_at: saleAt,
          promotion_discount_total: "0.0000",
          shift_id: shiftId,
          subtotal: "50.0000",
          tax_total: "0.0000",
          terminal_id: terminalId,
          total_paid: "50.0000",
          transaction_discount_total: "0.0000",
          transaction_id: negativeSaleId,
          transaction_number: `TRX-NEG-${negativeSaleId.slice(0, 8)}`,
        },
      },
      {
        correlation_id: negativeSaleCorrelationId,
        occurred_at: saleAt,
      },
    );
    expect(negativeSale).toMatchObject({
      cost_status: "PROVISIONAL",
      status: "COMPLETED",
      warnings: [],
    });
    const negativeSaleFacts = await database().query(
      `SELECT item.cost_unit_snapshot::text, item.cost_status,
              movement.base_quantity_delta::text,
              balance.base_quantity::text AS balance
       FROM sales.transaction_items item
       JOIN inventory.stock_movements movement
         ON movement.source_type = 'SALE_TRANSACTION'
        AND movement.source_id = item.transaction_id
        AND movement.source_line_id = item.id
       JOIN inventory.stock_balances balance
         ON balance.business_id = $2 AND balance.location_id = $3
        AND balance.product_id = item.product_id
       WHERE item.id = $1`,
      [negativeSaleItemId, businessId, locationId],
    );
    expect(negativeSaleFacts.rows[0]).toEqual({
      balance: "-3.000000",
      base_quantity_delta: "-5.000000",
      cost_status: "PROVISIONAL",
      cost_unit_snapshot: "5.00000000",
    });

    const purchaseId = randomUUID();
    const purchaseItemId = randomUUID();
    await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "purchasing.purchase.create",
      {
        items: [
          {
            agreed_discount_amount: "0.0000",
            agreed_free_qty: "0.000000",
            agreed_unit_price: "8.0000",
            conversion_snapshot: "1.00000000",
            expected_qty: "5.000000",
            item_id: purchaseItemId,
            product_id: negativeProductId,
            product_unit_id: negativeUnitId,
          },
        ],
        notes: "Negative replacement",
        purchase_date: "2026-08-23",
        purchase_id: purchaseId,
        purchase_number: `PUR-NEG-${purchaseId.slice(0, 8)}`,
        supplier_id: supplierId,
      },
    );
    const receiptItemId = randomUUID();
    const receivedAt = new Date().toISOString();
    const receipt = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "purchasing.receive_goods",
      {
        items: [
          {
            accepted_qty: "5.000000",
            conversion_snapshot: "1.00000000",
            free_qty_received: "0.000000",
            product_id: negativeProductId,
            product_unit_id: negativeUnitId,
            purchase_item_id: purchaseItemId,
            receipt_item_id: receiptItemId,
            received_qty: "5.000000",
            rejected_qty: "0.000000",
            rejection_reason: null,
          },
        ],
        notes: null,
        purchase_id: purchaseId,
        receipt_id: randomUUID(),
        receipt_number: `RCV-NEG-${purchaseId.slice(0, 8)}`,
        received_at: receivedAt,
      },
    );
    expect(receipt).toMatchObject({
      purchase_status: "RECEIVED",
      warnings: [],
    });
    const provisionalState = await database().query(
      `SELECT mwa_unit_cost::text, cost_status, cost_source_type, cost_source_id
       FROM costing.product_cost_states
       WHERE business_id = $1 AND location_id = $2 AND product_id = $3`,
      [businessId, locationId, negativeProductId],
    );
    expect(provisionalState.rows[0]).toMatchObject({
      cost_source_id: receiptItemId,
      cost_source_type: "PURCHASE_RECEIPT_ITEM",
      cost_status: "PROVISIONAL",
      mwa_unit_cost: "8.00000000",
    });
    const provisionalCogs = await database().query(
      `SELECT replacement.quantity::text,
              reconciliation.reconciliation_role,
              reconciliation.cost_status,
              reconciliation.value_delta::text
       FROM costing.negative_stock_replacements replacement
       JOIN costing.cogs_reconciliations reconciliation
         ON reconciliation.transaction_item_id = replacement.transaction_item_id
        AND reconciliation.source_receipt_item_id = replacement.receipt_item_id
       WHERE replacement.receipt_item_id = $1
       ORDER BY reconciliation.reconciliation_role`,
      [receiptItemId],
    );
    expect(provisionalCogs.rows).toEqual([
      {
        cost_status: "PROVISIONAL",
        quantity: "3.000000",
        reconciliation_role: "NEGATIVE_STOCK_REPLACEMENT_PROVISIONAL",
        value_delta: "9.00000000",
      },
    ]);

    const capturedAt = new Date().toISOString();
    await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "purchasing.invoice.upsert",
      {
        acquisition_charge_total: "0.0000",
        captured_at: capturedAt,
        charges: [],
        expected_invoice_version: 0,
        expected_purchase_version: 2,
        global_discount_total: "0.0000",
        grand_total: "50.0000",
        invoice_date: "2026-08-23",
        invoice_id: randomUUID(),
        item_discount_total: "0.0000",
        items: [
          {
            free_qty: "0.000000",
            invoice_item_id: randomUUID(),
            invoiced_qty: "5.000000",
            item_discount_amount: "0.0000",
            purchase_item_id: purchaseItemId,
            tax_amount: "0.0000",
            unit_price: "10.0000",
          },
        ],
        purchase_id: purchaseId,
        subtotal: "50.0000",
        supplier_invoice_number: `INV-NEG-${purchaseId.slice(0, 8)}`,
        tax_total: "0.0000",
      },
    );
    const posted = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "purchasing.purchase.post",
      {
        accepted_integrity_exception_ids: [],
        expected_version: 3,
        notes: "Final negative replacement cost",
        purchase_id: purchaseId,
      },
    );
    expect(posted.final_costs[0]).toMatchObject({
      cost_source_id: purchaseItemId,
      cost_source_type: "PURCHASE_ITEM",
      cost_status: "FINAL",
      final_landed_cost_per_base_unit: "10",
      inventory_reconciliation_value_delta: "4",
      mwa_unit_cost: "10",
      purchase_value_delta_allocated_to_cogs: "6",
    });
    const finalAllocation = await database().query(
      `SELECT reconciliation_role, cost_status, quantity::text, value_delta::text
       FROM costing.cogs_reconciliations
       WHERE business_id = $1 AND transaction_item_id = $2
       ORDER BY reconciliation_role`,
      [businessId, negativeSaleItemId],
    );
    expect(finalAllocation.rows).toEqual([
      {
        cost_status: "FINAL",
        quantity: "3.000000",
        reconciliation_role: "NEGATIVE_STOCK_REPLACEMENT_FINAL_DELTA",
        value_delta: "6.00000000",
      },
      {
        cost_status: "PROVISIONAL",
        quantity: "3.000000",
        reconciliation_role: "NEGATIVE_STOCK_REPLACEMENT_PROVISIONAL",
        value_delta: "9.00000000",
      },
    ]);
    const partition = await database().query(
      `SELECT event.value_delta::text AS inventory_delta,
              final_cogs.value_delta::text AS cogs_delta,
              state.mwa_unit_cost::text,
              state.cost_status
       FROM costing.cost_events event
       JOIN costing.product_cost_states state
         ON state.business_id = event.business_id
        AND state.location_id = event.location_id
        AND state.product_id = event.product_id
       JOIN costing.cogs_reconciliations final_cogs
         ON final_cogs.source_cost_event_id = (
           SELECT id FROM costing.cost_events final_event
           WHERE final_event.source_type = 'PURCHASE_ITEM'
             AND final_event.source_id = $1
             AND final_event.event_type = 'FINAL_LANDED_COST'
         )
        AND final_cogs.reconciliation_role = 'NEGATIVE_STOCK_REPLACEMENT_FINAL_DELTA'
       WHERE event.source_type = 'PURCHASE_ITEM'
         AND event.source_id = $1
         AND event.event_type = 'COST_RECONCILIATION'`,
      [purchaseItemId],
    );
    expect(partition.rows[0]).toMatchObject({
      cogs_delta: "6.00000000",
      cost_status: "FINAL",
      inventory_delta: "4.00000000",
      mwa_unit_cost: "10.00000000",
    });
  }, 30_000);

  it("uses a movement watermark and requires an explicit recount only before count confirmation", async () => {
    const anchorProductId = randomUUID();
    const secondProductId = randomUUID();
    const secondUnitId = randomUUID();
    await database().query(
      `INSERT INTO catalog.products (
         id, business_id, sku, name, category_id, base_unit_code,
         track_inventory, status
       ) VALUES ($1, $2, $3, 'Opname Concurrent Product', $4, 'PCS', TRUE, 'ACTIVE')`,
      [secondProductId, businessId, `OPN-${secondProductId.slice(0, 8)}`, categoryId],
    );
    await database().query(
      `INSERT INTO catalog.products (
         id, business_id, sku, name, category_id, base_unit_code,
         track_inventory, status
       ) VALUES ($1, $2, $3, 'Opname Anchor Product', $4, 'PCS', TRUE, 'ACTIVE')`,
      [anchorProductId, businessId, `OPA-${anchorProductId.slice(0, 8)}`, categoryId],
    );
    await database().query(
      `INSERT INTO catalog.product_units (
         id, business_id, product_id, unit_code, display_name, conversion_factor,
         can_sell, can_purchase, allow_decimal_qty, status
       ) VALUES ($1, $2, $3, 'PCS', 'Piece', 1, TRUE, TRUE, FALSE, 'ACTIVE')`,
      [secondUnitId, businessId, secondProductId],
    );

    const opnameId = randomUUID();
    await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.opname.create",
      {
        opname_id: opnameId,
        opname_number: `OPN-CON-${opnameId.slice(0, 8)}`,
        product_ids: [anchorProductId, secondProductId],
        scope_type: "SELECTED",
      },
    );
    await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.opname.count",
      {
        expected_version: 1,
        items: [
          {
            counted_at: new Date().toISOString(),
            physical_qty: "0.000000",
            product_id: anchorProductId,
          },
        ],
        opname_id: opnameId,
      },
    );
    const adjustmentId = randomUUID();
    await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.adjust",
      {
        adjustment_id: adjustmentId,
        adjustment_number: `ADJ-CON-IN-${adjustmentId.slice(0, 8)}`,
        direction: "IN",
        items: [
          {
            conversion_snapshot: "1.00000000",
            item_id: randomUUID(),
            product_id: secondProductId,
            product_unit_id: secondUnitId,
            quantity: "1.000000",
          },
        ],
        notes: "Movement while second item is unconfirmed",
        reason_code: "FOUND",
      },
    );
    const firstCount = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.opname.count",
      {
        expected_version: 2,
        items: [
          {
            counted_at: new Date().toISOString(),
            physical_qty: "1.000000",
            product_id: secondProductId,
          },
        ],
        opname_id: opnameId,
      },
    );
    expect(firstCount).toMatchObject({
      recount_required_count: "1",
      warnings: ["OPNAME_RECOUNT_RECOMMENDED"],
    });
    const reviewWithWarning = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.opname.review",
      { expected_version: 3, notes: null, opname_id: opnameId },
    );
    expect(reviewWithWarning.recount_required_count).toBe("1");
    const blockedPost = await rejectedCommand(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.opname.post",
      { expected_version: 4, notes: null, opname_id: opnameId },
    );
    expect(blockedPost).toMatchObject({
      body: { error: { code: "OPNAME_RECOUNT_REQUIRED" } },
      status: 409,
    });

    const recount = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.opname.recount",
      {
        expected_version: 4,
        items: [
          {
            counted_at: new Date().toISOString(),
            physical_qty: "1.000000",
            product_id: secondProductId,
          },
        ],
        opname_id: opnameId,
      },
    );
    expect(recount.recount_required_count).toBe("0");
    const afterCountAdjustmentId = randomUUID();
    await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.adjust",
      {
        adjustment_id: afterCountAdjustmentId,
        adjustment_number: `ADJ-CON-OUT-${afterCountAdjustmentId.slice(0, 8)}`,
        direction: "OUT",
        items: [
          {
            conversion_snapshot: "1.00000000",
            item_id: randomUUID(),
            product_id: secondProductId,
            product_unit_id: secondUnitId,
            quantity: "1.000000",
          },
        ],
        notes: "Movement after confirmed count",
        reason_code: "DATA_CORRECTION",
      },
    );
    const cleanReview = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.opname.review",
      { expected_version: 5, notes: null, opname_id: opnameId },
    );
    expect(cleanReview.recount_required_count).toBe("0");
    const posted = await command(
      sessionSecret,
      deviceId,
      locationId,
      authorizationVersion,
      "inventory.opname.post",
      { expected_version: 6, notes: null, opname_id: opnameId },
    );
    expect(posted.movements).toEqual([]);
    const watermark = await database().query(
      `SELECT item.system_qty_at_count::text, item.physical_qty::text,
              item.variance_qty::text, item.count_movement_sequence::text,
              balance.base_quantity::text AS current_quantity,
              max(movement.ledger_sequence)::text AS latest_movement_sequence
       FROM inventory.opname_items item
       JOIN inventory.opname_sessions session ON session.id = item.opname_session_id
       JOIN inventory.stock_balances balance
         ON balance.business_id = session.business_id
        AND balance.location_id = session.location_id
        AND balance.product_id = item.product_id
       JOIN inventory.stock_movements movement
         ON movement.business_id = session.business_id
        AND movement.location_id = session.location_id
        AND movement.product_id = item.product_id
       WHERE item.opname_session_id = $1 AND item.product_id = $2
       GROUP BY item.id, balance.base_quantity`,
      [opnameId, secondProductId],
    );
    expect(watermark.rows[0]).toMatchObject({
      current_quantity: "0.000000",
      physical_qty: "1.000000",
      system_qty_at_count: "1.000000",
      variance_qty: "0.000000",
    });
    expect(BigInt(watermark.rows[0].latest_movement_sequence)).toBeGreaterThan(
      BigInt(watermark.rows[0].count_movement_sequence),
    );
  }, 30_000);

  it("keeps authoritative posting/publication off the offline sync channel", async () => {
    const commandId = randomUUID();
    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/sync/push", {
        body: JSON.stringify({
          batch_id: randomUUID(),
          client_schema_version: 1,
          commands: [
            {
              authorization_version: authorizationVersion,
              command_id: commandId,
              command_type: "purchasing.purchase.post",
              correlation_id: randomUUID(),
              device_id: deviceId,
              location_id: locationId,
              occurred_at: new Date().toISOString(),
              payload: {
                accepted_integrity_exception_ids: [],
                expected_version: 1,
                notes: null,
                purchase_id: randomUUID(),
              },
              schema_version: 1,
            },
          ],
        }),
        headers: {
          authorization: `Bearer ${sessionSecret}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
      { DATABASE_URL: databaseUrl() },
    );
    expect(response.status).toBe(200);
    const body = /** @type {Record<string, any>} */ (await response.json());
    expect(body.results[0]).toMatchObject({
      command_id: commandId,
      error: { code: "ONLINE_REQUIRED" },
      status: "REJECTED_CONFLICT",
    });
  });
});
