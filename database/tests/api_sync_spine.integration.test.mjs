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
/** @type {string | undefined} */
let offlineSigningPrivateJwk;
const offlineSigningKeyId = "sync-spine-offline-key";

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

function requireClient() {
  if (client === undefined) throw new Error("client is not initialized.");
  return client;
}

function requireChildDatabaseUrl() {
  if (childDatabaseUrl === undefined) {
    throw new Error("childDatabaseUrl is not initialized.");
  }
  return childDatabaseUrl;
}

function apiEnvironment() {
  if (offlineSigningPrivateJwk === undefined) {
    throw new Error("offline signing key is not initialized.");
  }
  return {
    DATABASE_URL: requireChildDatabaseUrl(),
    OFFLINE_AUTH_SIGNING_KEY_ID: offlineSigningKeyId,
    OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK: offlineSigningPrivateJwk,
  };
}

/** @param {string} secret */
function sessionSecretHash(secret) {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Exercise the real request composition root. Each request creates and closes
 * its own PgRequestDatabase, matching the Worker request lifecycle.
 *
 * @param {string} path
 * @param {string} secret
 * @param {unknown} body
 * @param {string} [terminalId]
 */
function postJson(path, secret, body, terminalId) {
  const headers = new Headers({
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
    "idempotency-key": randomUUID(),
  });
  if (terminalId !== undefined) headers.set("x-terminal-id", terminalId);
  return handleRequest(
    new Request(`https://api.kastur.test${path}`, {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    }),
    apiEnvironment(),
  );
}

/**
 * @param {string} secret
 * @param {Record<string, any> & {command_id: string}} command
 * @param {string} terminalId
 */
function postCommand(secret, command, terminalId) {
  return handleRequest(
    new Request("https://api.kastur.test/api/v1/commands", {
      body: JSON.stringify(command),
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        "idempotency-key": command.command_id,
        "x-terminal-id": terminalId,
      },
      method: "POST",
    }),
    apiEnvironment(),
  );
}

/**
 * @param {string} path
 * @param {string} secret
 */
function get(path, secret) {
  return handleRequest(
    new Request(`https://api.kastur.test${path}`, {
      headers: { authorization: `Bearer ${secret}` },
    }),
    apiEnvironment(),
  );
}

/**
 * @param {string} path
 * @param {string} secret
 * @param {string} deviceId
 * @param {string} terminalId
 */
function getPos(path, secret, deviceId, terminalId) {
  return handleRequest(
    new Request(`https://api.kastur.test${path}`, {
      headers: {
        authorization: `Bearer ${secret}`,
        "x-kastur-client": "pos",
        "x-kastur-device-id": deviceId,
        "x-terminal-id": terminalId,
      },
    }),
    apiEnvironment(),
  );
}

/**
 * @param {string} secret
 * @param {unknown} body
 */
function postRecovery(secret, body) {
  return handleRequest(
    new Request("https://api.kastur.test/api/v1/sync/recovery-push", {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
        "x-kastur-client": "backoffice",
      },
      method: "POST",
    }),
    apiEnvironment(),
  );
}

/** @param {Response} response */
async function jsonObject(response) {
  const value = await response.json();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object JSON response.");
  }
  return /** @type {Record<string, any>} */ (value);
}

describeWithPostgres("API sync operational spine", () => {
  const businessId = randomUUID();
  const otherBusinessId = randomUUID();
  const locationId = randomUUID();
  const otherLocationId = randomUUID();
  const cashierUserId = randomUUID();
  const limitedUserId = randomUUID();
  const ownerUserId = randomUUID();
  const cashierMembershipId = randomUUID();
  const limitedMembershipId = randomUUID();
  const ownerMembershipId = randomUUID();
  const limitedRoleId = randomUUID();
  const primaryDeviceId = randomUUID();
  const pullDeviceId = randomUUID();
  const limitedDeviceId = randomUUID();
  const primarySessionId = randomUUID();
  const pullSessionId = randomUUID();
  const limitedSessionId = randomUUID();
  const ownerSessionId = randomUUID();
  const terminalId = randomUUID();
  const secondaryTerminalId = randomUUID();
  const categoryId = randomUUID();
  const productId = randomUUID();
  const productUnitId = randomUUID();
  const priceVersionId = randomUUID();
  const retailTierId = randomUUID();
  const currentPriceVersionId = randomUUID();
  const currentRetailTierId = randomUUID();
  const paymentMethodId = randomUUID();
  const primarySecret = `primary-session-${randomUUID()}`;
  const pullSecret = `pull-session-${randomUUID()}`;
  const limitedSecret = `limited-session-${randomUUID()}`;
  const ownerSecret = `owner-session-${randomUUID()}`;
  const authorizationVersion = 7;

  beforeAll(async () => {
    const signingKeys = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    if (!("privateKey" in signingKeys)) {
      throw new Error("Expected an asymmetric offline signing key pair.");
    }
    offlineSigningPrivateJwk = JSON.stringify(
      await crypto.subtle.exportKey("jwk", signingKeys.privateKey),
    );
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();

    childDatabaseName = `kastur_migration_test_${randomUUID().replaceAll("-", "")}`;
    await adminClient.query(
      `CREATE DATABASE ${quoteGeneratedDatabaseName(childDatabaseName)}`,
    );

    const childUrl = requireSafeAdminUrl();
    childUrl.pathname = `/${childDatabaseName}`;
    childDatabaseUrl = childUrl.toString();
    await applyMigrations({ databaseUrl: childDatabaseUrl });

    client = new Client({ connectionString: childDatabaseUrl });
    await client.connect();
    const database = requireClient();

    await database.query(
      `INSERT INTO core.businesses (id, name, timezone, status)
       VALUES
         ($1, 'Operational Spine', 'Asia/Makassar', 'ACTIVE'),
         ($2, 'Other Tenant', 'Asia/Makassar', 'ACTIVE')`,
      [businessId, otherBusinessId],
    );
    await database.query(
      `INSERT INTO core.locations
         (id, business_id, code, name, type, is_default, status)
       VALUES
         ($1, $2, 'MAIN', 'Main Store', 'STORE', true, 'ACTIVE'),
         ($3, $4, 'OTHER', 'Other Store', 'STORE', true, 'ACTIVE')`,
      [locationId, businessId, otherLocationId, otherBusinessId],
    );
    await database.query(
      `INSERT INTO identity.users (id, display_name, status)
       VALUES
         ($1, 'Cashier Main', 'ACTIVE'),
         ($2, 'Limited User', 'ACTIVE'),
         ($3, 'Recovery Owner', 'ACTIVE')`,
      [cashierUserId, limitedUserId, ownerUserId],
    );
    await database.query(
      `INSERT INTO identity.business_memberships
         (id, business_id, user_id, status)
       VALUES
         ($1, $2, $3, 'ACTIVE'),
         ($4, $2, $5, 'ACTIVE'),
         ($6, $2, $7, 'ACTIVE')`,
      [
        cashierMembershipId,
        businessId,
        cashierUserId,
        limitedMembershipId,
        limitedUserId,
        ownerMembershipId,
        ownerUserId,
      ],
    );
    await database.query(
      `INSERT INTO identity.roles
         (id, business_id, code, name, is_system, status)
       VALUES ($1, $2, 'LIMITED_POS', 'Limited POS', false, 'ACTIVE')`,
      [limitedRoleId, businessId],
    );
    await database.query(
      `INSERT INTO identity.membership_roles
         (membership_id, role_id, is_primary)
       VALUES
         ($1, '33333333-3333-4333-8333-333333333333', true),
         ($2, $3, true),
         ($4, '11111111-1111-4111-8111-111111111111', true)`,
      [cashierMembershipId, limitedMembershipId, limitedRoleId, ownerMembershipId],
    );
    await database.query(
      `INSERT INTO identity.role_permissions (role_id, permission_id)
       SELECT $1, id FROM identity.permissions
       WHERE code = 'workspace.pos.access'`,
      [limitedRoleId],
    );
    await database.query(
      `INSERT INTO identity.authorization_versions (membership_id, version)
       VALUES ($1, $4), ($2, $4), ($3, $4)`,
      [cashierMembershipId, limitedMembershipId, ownerMembershipId, authorizationVersion],
    );
    await database.query(
      `INSERT INTO identity.permission_overrides (
         id, membership_id, permission_id, effect, reason, created_by
       )
       SELECT $1, $2, id, 'GRANT', 'Cash command context regression', $3
       FROM identity.permissions WHERE code = 'cash.in'`,
      [randomUUID(), cashierMembershipId, cashierUserId],
    );
    await database.query(
      `INSERT INTO identity.permission_overrides (
         id, membership_id, permission_id, effect, reason, created_by
       )
       SELECT $1, $2, id, 'GRANT', 'Cross-cashier denial regression', $3
       FROM identity.permissions WHERE code = 'cash.in'`,
      [randomUUID(), limitedMembershipId, cashierUserId],
    );
    await database.query(
      `INSERT INTO identity.devices
         (id, business_id, device_key, name, platform, status)
       VALUES
         ($1, $4, 'primary-pos', 'Primary POS', 'PWA', 'ACTIVE'),
         ($2, $4, 'pull-pos', 'Pull POS', 'PWA', 'ACTIVE'),
         ($3, $4, 'limited-pos', 'Limited POS', 'PWA', 'ACTIVE')`,
      [primaryDeviceId, pullDeviceId, limitedDeviceId, businessId],
    );
    await database.query(
      `INSERT INTO identity.sessions
         (id, user_id, business_id, device_id, session_secret_hash, expires_at)
       VALUES
         ($1, $2, $7, $3, $4, '2035-01-01T00:00:00Z'),
         ($5, $2, $7, $6, $8, '2035-01-01T00:00:00Z'),
         ($9, $10, $7, $11, $12, '2035-01-01T00:00:00Z'),
         ($13, $14, $7, NULL, $15, '2035-01-01T00:00:00Z')`,
      [
        primarySessionId,
        cashierUserId,
        primaryDeviceId,
        sessionSecretHash(primarySecret),
        pullSessionId,
        pullDeviceId,
        businessId,
        sessionSecretHash(pullSecret),
        limitedSessionId,
        limitedUserId,
        limitedDeviceId,
        sessionSecretHash(limitedSecret),
        ownerSessionId,
        ownerUserId,
        sessionSecretHash(ownerSecret),
      ],
    );
    await database.query(
      `INSERT INTO core.terminals
         (id, business_id, location_id, code, name, status)
       VALUES
         ($1, $2, $3, 'POS-01', 'POS 01', 'ACTIVE'),
         ($4, $2, $3, 'POS-02', 'POS 02', 'ACTIVE')`,
      [terminalId, businessId, locationId, secondaryTerminalId],
    );
    await database.query(
      `INSERT INTO catalog.categories (id, business_id, name, status)
       VALUES ($1, $2, 'General', 'ACTIVE')`,
      [categoryId, businessId],
    );
    await database.query(
      `INSERT INTO catalog.products
         (id, business_id, sku, name, category_id, base_unit_code,
          track_inventory, status)
       VALUES ($1, $2, 'SPINE-001', 'Spine Product', $3, 'PCS', true, 'ACTIVE')`,
      [productId, businessId, categoryId],
    );
    await database.query(
      `INSERT INTO catalog.product_units
         (id, business_id, product_id, unit_code, display_name,
          conversion_factor, can_sell, can_purchase, allow_decimal_qty, status)
       VALUES ($1, $2, $3, 'PCS', 'Piece', 1, true, true, false, 'ACTIVE')`,
      [productUnitId, businessId, productId],
    );
    await database.query(
      `INSERT INTO sales.payment_methods
         (id, business_id, code, name, is_cash, offline_allowed,
          requires_reference, status)
       VALUES ($1, $2, 'CASH', 'Tunai', true, true, false, 'ACTIVE')`,
      [paymentMethodId, businessId],
    );
    await database.query(
      `INSERT INTO pricing.price_versions (
         id, business_id, product_unit_id, status, effective_from,
         tax_mode, tax_rate_snapshot, created_by, created_at
       ) VALUES (
         $1, $2, $3, 'SUPERSEDED', '2026-08-23T05:00:00Z',
         'NO_PPN', 0, $4, '2026-08-23T04:59:00Z'
       )`,
      [priceVersionId, businessId, productUnitId, cashierUserId],
    );
    await database.query(
      `UPDATE pricing.price_versions
       SET effective_to = '2026-08-23T05:30:00Z'
       WHERE id = $1`,
      [priceVersionId],
    );
    await database.query(
      `INSERT INTO pricing.price_tier_versions (
         id, price_version_id, tier_code, min_qty, unit_price, sort_order
       ) VALUES ($1, $2, 'RETAIL', 1, 10000, 0)`,
      [retailTierId, priceVersionId],
    );
    await database.query(
      `INSERT INTO pricing.price_versions (
         id, business_id, product_unit_id, status, effective_from,
         tax_mode, tax_rate_snapshot, created_by, created_at
       ) VALUES (
         $1, $2, $3, 'ACTIVE', '2026-08-23T05:30:00Z',
         'NO_PPN', 0, $4, '2026-08-23T05:29:00Z'
       )`,
      [currentPriceVersionId, businessId, productUnitId, cashierUserId],
    );
    await database.query(
      `INSERT INTO pricing.price_tier_versions (
         id, price_version_id, tier_code, min_qty, unit_price, sort_order
       ) VALUES ($1, $2, 'RETAIL', 1, 11000, 0)`,
      [currentRetailTierId, currentPriceVersionId],
    );
    await database.query(
      `INSERT INTO costing.product_cost_states
         (business_id, location_id, product_id, mwa_unit_cost,
          last_valid_mwa_unit_cost, latest_landed_unit_cost,
          pricing_reference_unit_cost, pricing_reference_source_type, updated_at)
       VALUES ($1, $2, $3, 6000, 6000, 6000, 6000, 'INITIAL_COST', CURRENT_TIMESTAMP)`,
      [businessId, locationId, productId],
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

  it("proves authenticated push, exactly-once retry, isolated pull, ACK, and denial paths", async () => {
    const database = requireClient();
    const openedAt = "2026-08-23T06:00:00.000Z";
    const soldAt = "2026-08-23T06:01:00.000Z";
    const shiftId = randomUUID();
    const shiftCorrelationId = randomUUID();
    const openingMovementId = randomUUID();
    const openingAuditId = randomUUID();
    const saleCommandId = randomUUID();
    const saleCorrelationId = randomUUID();
    const transactionItemId = randomUUID();
    const paymentId = randomUUID();

    const shiftCommand = {
      authorization_version: authorizationVersion,
      command_id: shiftId,
      command_type: "cash.shift.open",
      correlation_id: shiftCorrelationId,
      device_id: primaryDeviceId,
      location_id: locationId,
      occurred_at: openedAt,
      payload: {
        payload_version: 1,
        shift: {
          active_context_key: JSON.stringify([businessId, locationId, primaryDeviceId]),
          authorization_version: authorizationVersion,
          blind_actual_cash: null,
          blind_counted_at: null,
          business_id: businessId,
          cashier_user_id: cashierUserId,
          device_id: primaryDeviceId,
          location_id: locationId,
          opened_at: openedAt,
          opening_cash: "100000.0000",
          shift_id: shiftId,
          shift_number: "SHIFT-SPINE-001",
          status: "OPEN",
          sync_status: "PENDING",
          terminal_id: terminalId,
        },
        cash_movements: [{
          actor_user_id: cashierUserId,
          amount: "100000.0000",
          business_id: businessId,
          correlation_id: shiftCorrelationId,
          direction: "IN",
          id: openingMovementId,
          location_id: locationId,
          movement_type: "OPENING_BALANCE",
          notes: null,
          occurred_at: openedAt,
          reason_code: null,
          shift_id: shiftId,
          source_id: shiftId,
          source_type: "SHIFT",
        }],
        audit_events: [{
          action: "SHIFT_OPENED",
          actor_role_snapshot: "CASHIER",
          actor_type: "USER",
          actor_user_id: cashierUserId,
          after_data: {
            opening_cash: "100000.0000",
            shift_number: "SHIFT-SPINE-001",
            status: "OPEN",
            terminal_id: terminalId,
          },
          authorization_version: authorizationVersion,
          before_data: null,
          business_id: businessId,
          correlation_id: shiftCorrelationId,
          device_id: primaryDeviceId,
          entity_id: shiftId,
          entity_type: "CASH_SHIFT",
          id: openingAuditId,
          location_id: locationId,
          occurred_at: openedAt,
          reason: null,
          recorded_at: openedAt,
          session_id: null,
          sync_status: "PENDING",
        }],
      },
      schema_version: 1,
    };
    const shiftResponse = await postJson(
      "/api/v1/sync/push",
      primarySecret,
      {
        batch_id: randomUUID(),
        client_schema_version: 1,
        commands: [shiftCommand],
      },
      terminalId,
    );
    expect(shiftResponse.status).toBe(200);
    const shiftBody = await jsonObject(shiftResponse);
    expect(shiftBody.results).toMatchObject([
      {
        command_id: shiftId,
        result: { replayed: false, shift_id: shiftId, status: "OPEN" },
        status: "ACCEPTED",
      },
    ]);
    expect(
      (
        await database.query(
          `SELECT status, cashier_user_id, terminal_id
           FROM cash.shifts WHERE id = $1`,
          [shiftId],
        )
      ).rows[0],
    ).toEqual({
      cashier_user_id: cashierUserId,
      status: "OPEN",
      terminal_id: terminalId,
    });

    const deviceBBootstrapResponse = await get(
      `/api/v1/sync/bootstrap?terminal_id=${terminalId}`,
      pullSecret,
    );
    expect(deviceBBootstrapResponse.status).toBe(200);
    const deviceBBootstrap = await jsonObject(deviceBBootstrapResponse);
    const deviceBBootstrapCursor = String(deviceBBootstrap.sync_cursor);
    expect(
      /** @type {Array<Record<string, any>>} */ (deviceBBootstrap.stock_balances)
        .some((balance) => balance.product_id === productId),
    ).toBe(false);

    const saleCommand = {
      authorization_version: authorizationVersion,
      command_id: saleCommandId,
      command_type: "sales.complete",
      correlation_id: saleCorrelationId,
      device_id: primaryDeviceId,
      location_id: locationId,
      occurred_at: soldAt,
      payload: {
        items: [
          {
            base_quantity: "2.000000",
            base_unit_price_snapshot: "10000.0000",
            conversion_snapshot: "1.00000000",
            final_unit_price_snapshot: "10000.0000",
            line_index: 0,
            line_total: "20000.0000",
            manual_line_discount_snapshot: "0.0000",
            price_effective_from_snapshot: "2026-08-23T05:00:00.000Z",
            price_version_id_snapshot: priceVersionId,
            product_id: productId,
            product_name_snapshot: "Spine Product",
            product_unit_id: productUnitId,
            promotion_discount_snapshot: "0.0000",
            promotion_id: null,
            promotion_type_snapshot: null,
            promotion_value_snapshot: null,
            quantity: "2.000000",
            sku_snapshot: "SPINE-001",
            tax_amount_snapshot: "0.0000",
            tax_mode_snapshot: "NO_PPN",
            tax_rate_snapshot: "0.00000000",
            tier_code_snapshot: "RETAIL",
            tier_id_snapshot: retailTierId,
            tier_min_qty_snapshot: "1.000000",
            tier_unit_price_snapshot: "10000.0000",
            track_inventory_snapshot: true,
            transaction_discount_allocation: "0.0000",
            transaction_item_id: transactionItemId,
            unit_code_snapshot: "PCS",
            unit_name_snapshot: "Piece",
          },
        ],
        payload_version: 1,
        payments: [
          {
            amount: "20000.0000",
            amount_tendered: "25000.0000",
            change_amount: "5000.0000",
            confirmation_type: "CASH_CONFIRMED",
            external_reference: null,
            method_code: "CASH",
            payment_id: paymentId,
            received_at: soldAt,
          },
        ],
        transaction: {
          authorization_version: authorizationVersion,
          business_id: businessId,
          change_amount: "5000.0000",
          completed_at: soldAt,
          correlation_id: saleCorrelationId,
          created_by: cashierUserId,
          customer_id: null,
          device_id: primaryDeviceId,
          grand_total: "20000.0000",
          line_discount_total: "0.0000",
          location_id: locationId,
          occurred_at: soldAt,
          promotion_discount_total: "0.0000",
          shift_id: shiftId,
          subtotal: "20000.0000",
          tax_total: "0.0000",
          terminal_id: terminalId,
          total_paid: "20000.0000",
          transaction_discount_total: "0.0000",
          transaction_id: saleCommandId,
          transaction_number: "TRX-SPINE-001",
        },
      },
      schema_version: 1,
    };
    const salePush = {
      batch_id: randomUUID(),
      client_schema_version: 1,
      commands: [saleCommand],
    };

    // Simulate an unknown network outcome: the server finishes, but the client
    // discards the first response and retries the identical durable command.
    await postJson("/api/v1/sync/push", primarySecret, salePush);
    const retryResponse = await postJson("/api/v1/sync/push", primarySecret, salePush);
    expect(retryResponse.status).toBe(200);
    const retryBody = await jsonObject(retryResponse);
    expect(retryBody.results).toMatchObject([
      {
        command_id: saleCommandId,
        result: {
          cost_status: "PROVISIONAL",
          replayed: true,
          status: "COMPLETED",
          transaction_id: saleCommandId,
          warnings: ["STALE_PRICING_EXCEPTION"],
        },
        status: "ACCEPTED_WITH_REVIEW",
      },
    ]);

    const effects = await database.query(
      `SELECT
         (SELECT count(*)::integer FROM sales.transactions WHERE id = $1) AS transactions,
         (SELECT count(*)::integer FROM sales.payments WHERE transaction_id = $1) AS payments,
         (SELECT count(*)::integer FROM inventory.stock_movements
           WHERE source_type = 'SALE_TRANSACTION' AND source_id = $1) AS stock_movements,
         (SELECT count(*)::integer FROM cash.cash_movements
           WHERE source_type = 'SALE_TRANSACTION' AND source_id = $1) AS cash_movements,
         (SELECT count(*)::integer FROM audit.audit_events
           WHERE entity_type = 'sales_transaction' AND entity_id = $1) AS audit_events,
         (SELECT count(*)::integer FROM sync.idempotency_records
           WHERE business_id = $2 AND command_type = 'sales.complete'
             AND idempotency_key = $1::text AND status = 'COMPLETED') AS idempotency_records,
         (SELECT count(*)::integer FROM sync.change_feed
           WHERE business_id = $2 AND entity_type = 'sales_transaction'
             AND entity_id = $1) AS changes`,
      [saleCommandId, businessId],
    );
    expect(effects.rows[0]).toEqual({
      audit_events: 1,
      cash_movements: 1,
      changes: 1,
      idempotency_records: 1,
      payments: 1,
      stock_movements: 1,
      transactions: 1,
    });
    const values = await database.query(
      `SELECT
         (SELECT status FROM sales.transactions WHERE id = $1) AS transaction_status,
         (SELECT amount::text FROM sales.payments WHERE transaction_id = $1) AS payment_amount,
         (SELECT base_quantity::text FROM inventory.stock_balances
           WHERE business_id = $2 AND location_id = $3 AND product_id = $4) AS stock_balance,
         (SELECT amount::text FROM cash.cash_movements
           WHERE source_type = 'SALE_TRANSACTION' AND source_id = $1) AS cash_amount`,
      [saleCommandId, businessId, locationId, productId],
    );
    expect(values.rows[0]).toEqual({
      cash_amount: "20000.0000",
      payment_amount: "20000.0000",
      stock_balance: "-2.000000",
      transaction_status: "COMPLETED",
    });

    // Device B consumes only the incremental cursor page after its one initial
    // bootstrap. Local browser application is covered in the POS/local-db tests.
    const deviceBPullResponse = await get(
      `/api/v1/sync/pull?cursor=${encodeURIComponent(deviceBBootstrapCursor)}&limit=50`,
      pullSecret,
    );
    expect(deviceBPullResponse.status).toBe(200);
    const deviceBPull = await jsonObject(deviceBPullResponse);
    const deviceBChanges = /** @type {Array<Record<string, any>>} */ (deviceBPull.changes);
    const deviceBStock = deviceBChanges.find(
      (change) => change.entity_type === "stock_balance" && change.entity_id === productId,
    );
    expect(deviceBStock).toMatchObject({
      change_type: "UPSERT",
      payload: {
        base_quantity: "-2.000000",
        business_id: businessId,
        location_id: locationId,
        product_id: productId,
      },
    });
    expect(deviceBStock?.payload).not.toHaveProperty("mwa_unit_cost");
    const deviceBPullCursor = String(deviceBPull.next_cursor);
    expect(BigInt(deviceBPullCursor)).toBeGreaterThan(BigInt(deviceBBootstrapCursor));
    const deviceBAckResponse = await postJson("/api/v1/sync/ack", pullSecret, {
      device_id: pullDeviceId,
      last_applied_sequence: deviceBPullCursor,
    });
    expect(deviceBAckResponse.status).toBe(200);
    expect(await jsonObject(deviceBAckResponse)).toEqual({
      acknowledged_cursor: deviceBPullCursor,
      device_id: pullDeviceId,
    });

    const conflictingCommand = structuredClone(saleCommand);
    conflictingCommand.payload.transaction.transaction_number = "TRX-SPINE-DIFFERENT";
    const conflictResponse = await postJson("/api/v1/sync/push", primarySecret, {
      batch_id: randomUUID(),
      client_schema_version: 1,
      commands: [conflictingCommand],
    });
    expect(conflictResponse.status).toBe(200);
    const conflictBody = await jsonObject(conflictResponse);
    expect(conflictBody.results).toEqual([
      {
        command_id: saleCommandId,
        error: {
          code: "IDEMPOTENCY_KEY_REUSE_ERROR",
          message: "command_id pernah digunakan dengan payload berbeda.",
        },
        status: "REJECTED_CONFLICT",
      },
    ]);

    const trackTamper = structuredClone(saleCommand);
    trackTamper.command_id = randomUUID();
    trackTamper.correlation_id = randomUUID();
    trackTamper.payload.transaction.transaction_id = trackTamper.command_id;
    trackTamper.payload.transaction.transaction_number = `TRX-${trackTamper.command_id}`;
    trackTamper.payload.transaction.correlation_id = trackTamper.correlation_id;
    const trackTamperItem = trackTamper.payload.items[0];
    const trackTamperPayment = trackTamper.payload.payments[0];
    if (trackTamperItem === undefined || trackTamperPayment === undefined) {
      throw new Error("Sale tamper fixture is incomplete.");
    }
    trackTamperItem.transaction_item_id = randomUUID();
    trackTamperItem.track_inventory_snapshot = false;
    trackTamperPayment.payment_id = randomUUID();
    const trackTamperResponse = await postJson("/api/v1/sync/push", primarySecret, {
      batch_id: randomUUID(),
      client_schema_version: 1,
      commands: [trackTamper],
    });
    expect((await jsonObject(trackTamperResponse)).results).toMatchObject([
      {
        command_id: trackTamper.command_id,
        error: { code: "SALE_TRACK_INVENTORY_MISMATCH" },
        status: "REJECTED_CONFLICT",
      },
    ]);

    const priceTamper = structuredClone(saleCommand);
    priceTamper.command_id = randomUUID();
    priceTamper.correlation_id = randomUUID();
    priceTamper.payload.transaction.transaction_id = priceTamper.command_id;
    priceTamper.payload.transaction.transaction_number = `TRX-${priceTamper.command_id}`;
    priceTamper.payload.transaction.correlation_id = priceTamper.correlation_id;
    const priceTamperItem = priceTamper.payload.items[0];
    const priceTamperPayment = priceTamper.payload.payments[0];
    if (priceTamperItem === undefined || priceTamperPayment === undefined) {
      throw new Error("Sale tamper fixture is incomplete.");
    }
    priceTamperItem.transaction_item_id = randomUUID();
    priceTamperItem.base_unit_price_snapshot = "9999.0000";
    priceTamperPayment.payment_id = randomUUID();
    const priceTamperResponse = await postJson("/api/v1/sync/push", primarySecret, {
      batch_id: randomUUID(),
      client_schema_version: 1,
      commands: [priceTamper],
    });
    expect((await jsonObject(priceTamperResponse)).results).toMatchObject([
      {
        command_id: priceTamper.command_id,
        error: { code: "SALE_BASE_PRICE_MISMATCH" },
        status: "REJECTED_CONFLICT",
      },
    ]);

    const tenderTamper = structuredClone(saleCommand);
    tenderTamper.command_id = randomUUID();
    tenderTamper.correlation_id = randomUUID();
    tenderTamper.payload.transaction.transaction_id = tenderTamper.command_id;
    tenderTamper.payload.transaction.transaction_number = `TRX-${tenderTamper.command_id}`;
    tenderTamper.payload.transaction.correlation_id = tenderTamper.correlation_id;
    const tenderTamperItem = tenderTamper.payload.items[0];
    const tenderTamperPayment = tenderTamper.payload.payments[0];
    if (tenderTamperItem === undefined || tenderTamperPayment === undefined) {
      throw new Error("Sale settlement fixture is incomplete.");
    }
    tenderTamperItem.transaction_item_id = randomUUID();
    tenderTamperPayment.payment_id = randomUUID();
    tenderTamperPayment.amount_tendered = "20000.0000";
    const tenderTamperResponse = await postJson("/api/v1/sync/push", primarySecret, {
      batch_id: randomUUID(),
      client_schema_version: 1,
      commands: [tenderTamper],
    });
    expect((await jsonObject(tenderTamperResponse)).results).toMatchObject([
      {
        command_id: tenderTamper.command_id,
        error: { code: "CASH_SETTLEMENT_INVALID" },
        status: "REJECTED_VALIDATION",
      },
    ]);

    const authorizationTamper = structuredClone(saleCommand);
    authorizationTamper.command_id = randomUUID();
    authorizationTamper.correlation_id = randomUUID();
    authorizationTamper.payload.transaction.transaction_id = authorizationTamper.command_id;
    authorizationTamper.payload.transaction.transaction_number =
      `TRX-${authorizationTamper.command_id}`;
    authorizationTamper.payload.transaction.correlation_id = authorizationTamper.correlation_id;
    authorizationTamper.payload.transaction.authorization_version = authorizationVersion - 1;
    const authorizationTamperItem = authorizationTamper.payload.items[0];
    const authorizationTamperPayment = authorizationTamper.payload.payments[0];
    if (authorizationTamperItem === undefined || authorizationTamperPayment === undefined) {
      throw new Error("Sale authorization fixture is incomplete.");
    }
    authorizationTamperItem.transaction_item_id = randomUUID();
    authorizationTamperPayment.payment_id = randomUUID();
    const authorizationTamperResponse = await postJson(
      "/api/v1/sync/push",
      primarySecret,
      {
        batch_id: randomUUID(),
        client_schema_version: 1,
        commands: [authorizationTamper],
      },
    );
    expect((await jsonObject(authorizationTamperResponse)).results).toMatchObject([
      {
        command_id: authorizationTamper.command_id,
        error: { code: "AUTHORIZATION_VERSION_MISMATCH" },
        status: "REJECTED_VALIDATION",
      },
    ]);

    const duplicateNumber = structuredClone(saleCommand);
    duplicateNumber.command_id = randomUUID();
    duplicateNumber.correlation_id = randomUUID();
    duplicateNumber.payload.transaction.transaction_id = duplicateNumber.command_id;
    duplicateNumber.payload.transaction.correlation_id = duplicateNumber.correlation_id;
    const duplicateNumberItem = duplicateNumber.payload.items[0];
    const duplicateNumberPayment = duplicateNumber.payload.payments[0];
    if (duplicateNumberItem === undefined || duplicateNumberPayment === undefined) {
      throw new Error("Sale duplicate fixture is incomplete.");
    }
    duplicateNumberItem.transaction_item_id = randomUUID();
    duplicateNumberPayment.payment_id = randomUUID();
    const duplicateNumberResponse = await postJson("/api/v1/sync/push", primarySecret, {
      batch_id: randomUUID(),
      client_schema_version: 1,
      commands: [duplicateNumber],
    });
    expect((await jsonObject(duplicateNumberResponse)).results).toMatchObject([
      {
        command_id: duplicateNumber.command_id,
        error: { code: "DOMAIN_UNIQUE_CONFLICT" },
        status: "REJECTED_CONFLICT",
      },
    ]);
    expect(
      (
        await database.query(
          `SELECT count(*)::integer AS count
           FROM sales.transactions WHERE id = ANY($1::uuid[])`,
          [
            [
              trackTamper.command_id,
              priceTamper.command_id,
              tenderTamper.command_id,
              authorizationTamper.command_id,
              duplicateNumber.command_id,
            ],
          ],
        )
      ).rows[0].count,
    ).toBe(0);

    const foreignShiftId = randomUUID();
    const foreignOccurredAt = "2026-08-23T06:02:00.000Z";
    const foreignResponse = await postJson("/api/v1/sync/push", primarySecret, {
      batch_id: randomUUID(),
      client_schema_version: 1,
      commands: [
        {
          authorization_version: authorizationVersion,
          command_id: foreignShiftId,
          command_type: "cash.shift.open",
          correlation_id: randomUUID(),
          device_id: primaryDeviceId,
          location_id: otherLocationId,
          occurred_at: foreignOccurredAt,
          payload: {
            business_id: otherBusinessId,
            cashier_user_id: cashierUserId,
            device_id: primaryDeviceId,
            location_id: otherLocationId,
            opened_at: foreignOccurredAt,
            opening_cash: "1.0000",
            shift_id: foreignShiftId,
            shift_number: "FOREIGN-SHIFT",
            terminal_id: terminalId,
          },
          schema_version: 1,
        },
      ],
    });
    expect(foreignResponse.status).toBe(200);
    expect((await jsonObject(foreignResponse)).results).toMatchObject([
      {
        command_id: foreignShiftId,
        error: { code: "CASH_CONTEXT_MISMATCH" },
        status: "REJECTED_PERMISSION",
      },
    ]);

    const limitedShiftId = randomUUID();
    const limitedOccurredAt = "2026-08-23T06:03:00.000Z";
    const limitedResponse = await postJson("/api/v1/sync/push", limitedSecret, {
      batch_id: randomUUID(),
      client_schema_version: 1,
      commands: [
        {
          authorization_version: authorizationVersion,
          command_id: limitedShiftId,
          command_type: "cash.shift.open",
          correlation_id: randomUUID(),
          device_id: limitedDeviceId,
          location_id: locationId,
          occurred_at: limitedOccurredAt,
          payload: {
            business_id: businessId,
            cashier_user_id: limitedUserId,
            device_id: limitedDeviceId,
            location_id: locationId,
            opened_at: limitedOccurredAt,
            opening_cash: "1.0000",
            shift_id: limitedShiftId,
            shift_number: "LIMITED-SHIFT",
            terminal_id: terminalId,
          },
          schema_version: 1,
        },
      ],
    });
    expect(limitedResponse.status).toBe(200);
    expect((await jsonObject(limitedResponse)).results).toMatchObject([
      {
        command_id: limitedShiftId,
        error: { code: "PERMISSION_DENIED" },
        status: "REJECTED_PERMISSION",
      },
    ]);

    const foreignEntityId = randomUUID();
    await database.query(
      `INSERT INTO sync.change_feed
         (business_id, location_id, entity_type, entity_id, change_type,
          payload, occurred_at)
       VALUES ($1, $2, 'foreign_secret', $3, 'EVENT', '{}', CURRENT_TIMESTAMP)`,
      [otherBusinessId, otherLocationId, foreignEntityId],
    );
    const hiddenCostEntityId = randomUUID();
    const hiddenCostChange = await database.query(
      `INSERT INTO sync.change_feed
         (business_id, location_id, entity_type, entity_id, change_type,
          payload, occurred_at)
       VALUES ($1, $2, 'purchase', $3, 'EVENT',
               '{"final_costs":[{"unit_cost":"999999.0000"}]}'::jsonb,
               CURRENT_TIMESTAMP)
       RETURNING sequence::text`,
      [businessId, locationId, hiddenCostEntityId],
    );
    const pullResponse = await get("/api/v1/sync/pull?cursor=0&limit=50", pullSecret);
    expect(pullResponse.status).toBe(200);
    const pullBody = await jsonObject(pullResponse);
    const changes = /** @type {Array<Record<string, any>>} */ (pullBody.changes);
    expect(changes.map((change) => change.entity_id)).toEqual([
      shiftId,
      productId,
      saleCommandId,
    ]);
    expect(changes.map((change) => change.entity_type)).toEqual([
      "cash_shift",
      "stock_balance",
      "sales_transaction",
    ]);
    expect(changes.some((change) => change.entity_id === foreignEntityId)).toBe(false);
    expect(changes.some((change) => change.entity_id === hiddenCostEntityId)).toBe(false);
    const pulledStockBalance = changes[1];
    const pulledSale = changes[2];
    const hiddenCursor = hiddenCostChange.rows[0]?.sequence;
    if (
      pulledStockBalance === undefined ||
      pulledSale === undefined ||
      hiddenCursor === undefined
    ) {
      throw new Error("Expected Stock, Sale, and hidden cursor fixtures.");
    }
    expect(pulledStockBalance.payload).toMatchObject({
      base_quantity: "-2.000000",
      business_id: businessId,
      location_id: locationId,
      product_id: productId,
    });
    expect(pulledStockBalance.payload).not.toHaveProperty("mwa_unit_cost");
    expect(pulledSale.payload).not.toHaveProperty("cost_status");
    expect(String(pullBody.next_cursor)).toBe(hiddenCursor);

    const nextCursor = String(pullBody.next_cursor);
    const ackResponse = await postJson("/api/v1/sync/ack", pullSecret, {
      device_id: pullDeviceId,
      last_applied_sequence: nextCursor,
    });
    expect(ackResponse.status).toBe(200);
    expect(await jsonObject(ackResponse)).toEqual({
      acknowledged_cursor: nextCursor,
      device_id: pullDeviceId,
    });
    const ackState = await database.query(
      `SELECT last_ack_sequence::text, (last_pull_at IS NOT NULL) AS pulled
       FROM sync.device_sync_states
       WHERE business_id = $1 AND device_id = $2`,
      [businessId, pullDeviceId],
    );
    expect(ackState.rows[0]).toEqual({
      last_ack_sequence: nextCursor,
      pulled: true,
    });

    const manualCashCommand = (
      /** @type {{actor_user_id: string, device_id: string, occurred_at: string}} */ input,
    ) => {
      const commandId = randomUUID();
      const correlationId = randomUUID();
      return {
        authorization_version: authorizationVersion,
        command_id: commandId,
        command_type: "cash.movement.record",
        correlation_id: correlationId,
        device_id: input.device_id,
        location_id: locationId,
        occurred_at: input.occurred_at,
        payload: {
          actor_user_id: input.actor_user_id,
          amount: "5000.0000",
          business_id: businessId,
          correlation_id: correlationId,
          id: commandId,
          location_id: locationId,
          movement_type: "CASH_IN",
          notes: "Cash authority regression",
          occurred_at: input.occurred_at,
          reason_code: "DRAWER_TOP_UP",
          shift_id: shiftId,
          source_id: commandId,
          source_type: "MANUAL",
        },
        schema_version: 1,
      };
    };

    const wrongTerminalCommand = manualCashCommand({
      actor_user_id: cashierUserId,
      device_id: primaryDeviceId,
      occurred_at: "2026-08-23T06:04:00.000Z",
    });
    const wrongTerminalResponse = await postCommand(
      primarySecret,
      wrongTerminalCommand,
      secondaryTerminalId,
    );
    expect(wrongTerminalResponse.status).toBe(403);
    expect(await jsonObject(wrongTerminalResponse)).toMatchObject({
      error: { code: "CASH_CONTEXT_MISMATCH" },
    });

    const crossCashierCommand = manualCashCommand({
      actor_user_id: limitedUserId,
      device_id: limitedDeviceId,
      occurred_at: "2026-08-23T06:05:00.000Z",
    });
    const crossCashierResponse = await postJson(
      "/api/v1/sync/push",
      limitedSecret,
      {
        batch_id: randomUUID(),
        client_schema_version: 1,
        commands: [crossCashierCommand],
      },
      terminalId,
    );
    expect(crossCashierResponse.status).toBe(200);
    expect((await jsonObject(crossCashierResponse)).results).toMatchObject([
      {
        command_id: crossCashierCommand.command_id,
        error: { code: "CASH_CONTEXT_MISMATCH" },
        status: "REJECTED_PERMISSION",
      },
    ]);

    const wrongDeviceCommand = manualCashCommand({
      actor_user_id: cashierUserId,
      device_id: pullDeviceId,
      occurred_at: "2026-08-23T06:06:00.000Z",
    });
    const wrongDeviceResponse = await postJson(
      "/api/v1/sync/push",
      pullSecret,
      {
        batch_id: randomUUID(),
        client_schema_version: 1,
        commands: [wrongDeviceCommand],
      },
      terminalId,
    );
    expect((await jsonObject(wrongDeviceResponse)).results).toMatchObject([
      {
        command_id: wrongDeviceCommand.command_id,
        error: { code: "CASH_CONTEXT_MISMATCH" },
        status: "REJECTED_PERMISSION",
      },
    ]);

    expect(
      (
        await database.query(
          `SELECT count(*)::integer AS count
           FROM cash.cash_movements WHERE id = ANY($1::uuid[])`,
          [[
            wrongTerminalCommand.command_id,
            crossCashierCommand.command_id,
            wrongDeviceCommand.command_id,
          ]],
        )
      ).rows[0].count,
    ).toBe(0);

    const closedAt = "2026-08-23T06:10:00.000Z";
    const closeCommandId = randomUUID();
    const closeResponse = await postCommand(
      primarySecret,
      {
        authorization_version: authorizationVersion,
        command_id: closeCommandId,
        command_type: "cash.shift.close",
        correlation_id: randomUUID(),
        device_id: primaryDeviceId,
        location_id: locationId,
        occurred_at: closedAt,
        payload: {
          actual_cash: "120000.0000",
          created_at: closedAt,
          id: closeCommandId,
          location_id: locationId,
          shift_id: shiftId,
          variance_reason: null,
        },
        schema_version: 1,
      },
      terminalId,
    );
    expect(closeResponse.status).toBe(200);
    expect(await jsonObject(closeResponse)).toMatchObject({
      result: {
        expected_cash: "120000.0000",
        shift_id: shiftId,
        status: "CLOSED",
        variance: "0.0000",
      },
    });

    const lateCashCommand = manualCashCommand({
      actor_user_id: cashierUserId,
      device_id: primaryDeviceId,
      occurred_at: "2026-08-23T06:09:00.000Z",
    });
    const lateCashResponse = await postJson(
      "/api/v1/sync/push",
      primarySecret,
      {
        batch_id: randomUUID(),
        client_schema_version: 1,
        commands: [lateCashCommand],
      },
      terminalId,
    );
    expect((await jsonObject(lateCashResponse)).results).toMatchObject([
      {
        command_id: lateCashCommand.command_id,
        result: { warnings: ["LATE_SHIFT_EVENT"] },
        status: "ACCEPTED_WITH_REVIEW",
        warnings: [{ code: "LATE_SHIFT_EVENT" }],
      },
    ]);
    const lateEffects = await database.query(
      `SELECT
         (SELECT count(*)::integer FROM cash.cash_movements WHERE id = $1) AS movements,
         (SELECT count(*)::integer FROM cash.shift_reconciliations
          WHERE shift_id = $2 AND source_type = 'CASH_MOVEMENT' AND source_id = $1)
           AS reconciliations,
         (SELECT expected_cash::text FROM cash.shift_closing_snapshots WHERE shift_id = $2)
           AS immutable_expected_cash,
         (SELECT expected_cash_delta::text FROM cash.shift_reconciliations
          WHERE shift_id = $2 AND source_type = 'CASH_MOVEMENT' AND source_id = $1)
           AS reconciliation_delta`,
      [lateCashCommand.command_id, shiftId],
    );
    expect(lateEffects.rows[0]).toEqual({
      immutable_expected_cash: "120000.0000",
      movements: 1,
      reconciliation_delta: "5000.0000",
      reconciliations: 1,
    });

    const signedContextResponse = await getPos(
      "/api/v1/auth/context",
      primarySecret,
      primaryDeviceId,
      terminalId,
    );
    expect(signedContextResponse.status).toBe(200);
    const signedContext = await jsonObject(signedContextResponse);
    const offlineGrant = signedContext.data.offline_authorization;
    expect(offlineGrant).toMatchObject({
      device_id: primaryDeviceId,
      key_id: offlineSigningKeyId,
      terminal_id: terminalId,
    });
    const recoveryShiftId = randomUUID();
    const recoveryCorrelationId = randomUUID();
    const recoveryOccurredAt = new Date(
      new Date(offlineGrant.issued_at).getTime() + 1_000,
    ).toISOString();
    const recoveryCommand = {
      authorization_version: offlineGrant.authorization.authorization_version,
      command_id: recoveryShiftId,
      command_type: "cash.shift.open",
      correlation_id: recoveryCorrelationId,
      device_id: primaryDeviceId,
      location_id: locationId,
      occurred_at: recoveryOccurredAt,
      offline_authorization: offlineGrant,
      payload: {
        payload_version: 1,
        shift: {
          authorization_version: offlineGrant.authorization.authorization_version,
          business_id: businessId,
          cashier_user_id: cashierUserId,
          device_id: primaryDeviceId,
          location_id: locationId,
          opened_at: recoveryOccurredAt,
          opening_cash: "25000.0000",
          shift_id: recoveryShiftId,
          shift_number: `REC-${recoveryShiftId.slice(0, 8)}`,
          terminal_id: terminalId,
        },
      },
      schema_version: 1,
    };
    const recoveryBatch = {
      batch_id: recoveryShiftId,
      client_schema_version: 1,
      commands: [recoveryCommand],
      recovery_reason: "Owner memverifikasi fakta shift dari perangkat yang dicabut.",
    };

    await database.query(
      `UPDATE identity.devices
       SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [primaryDeviceId],
    );
    const deniedNormalPush = await postJson(
      "/api/v1/sync/push",
      primarySecret,
      recoveryBatch,
      terminalId,
    );
    expect(deniedNormalPush.status).toBe(403);
    expect(await jsonObject(deniedNormalPush)).toMatchObject({
      error: { code: "DEVICE_REVOKED" },
    });

    const deniedHistoricalBearer = await postRecovery(primarySecret, recoveryBatch);
    expect(deniedHistoricalBearer.status).toBe(403);

    const recovered = await postRecovery(ownerSecret, recoveryBatch);
    expect(recovered.status).toBe(200);
    expect((await jsonObject(recovered)).results).toMatchObject([
      {
        command_id: recoveryShiftId,
        status: "ACCEPTED_WITH_REVIEW",
        warnings: [{ code: "AUTHORIZATION_STALE_EXCEPTION" }],
      },
    ]);
    const recoveredAgain = await postRecovery(ownerSecret, recoveryBatch);
    expect((await jsonObject(recoveredAgain)).results).toMatchObject([
      {
        command_id: recoveryShiftId,
        result: { replayed: true },
        status: "ACCEPTED_WITH_REVIEW",
      },
    ]);
    expect(
      (
        await database.query(
          `SELECT count(*)::integer AS count
           FROM cash.shifts WHERE id = $1`,
          [recoveryShiftId],
        )
      ).rows[0].count,
    ).toBe(1);
    const recoveryApproval = await database.query(
      `SELECT actor_user_id, action, reason, after_data
       FROM audit.audit_events
       WHERE entity_type = 'sync_recovery_batch' AND entity_id = $1
       ORDER BY recorded_at ASC
       LIMIT 1`,
      [recoveryShiftId],
    );
    expect(recoveryApproval.rows[0]).toMatchObject({
      actor_user_id: ownerUserId,
      action: "OFFLINE_FACT_RECOVERY_APPROVED",
      reason: "Owner memverifikasi fakta shift dari perangkat yang dicabut.",
      after_data: {
        historical_session_id: primarySessionId,
        terminal_id: terminalId,
      },
    });

    const beforeGrantShiftId = randomUUID();
    const beforeGrantOccurredAt = new Date(
      new Date(offlineGrant.issued_at).getTime() - 1_000,
    ).toISOString();
    const beforeGrantCommand = {
      ...recoveryCommand,
      command_id: beforeGrantShiftId,
      correlation_id: randomUUID(),
      occurred_at: beforeGrantOccurredAt,
      payload: {
        ...recoveryCommand.payload,
        shift: {
          ...recoveryCommand.payload.shift,
          opened_at: beforeGrantOccurredAt,
          shift_id: beforeGrantShiftId,
          shift_number: `REC-${beforeGrantShiftId.slice(0, 8)}`,
        },
      },
    };
    const beforeGrantResponse = await postRecovery(ownerSecret, {
      batch_id: beforeGrantShiftId,
      client_schema_version: 1,
      commands: [beforeGrantCommand],
      recovery_reason: "Owner menguji penolakan fakta sebelum grant diterbitkan.",
    });
    expect((await jsonObject(beforeGrantResponse)).results).toMatchObject([
      {
        command_id: beforeGrantShiftId,
        error: { code: "OFFLINE_AUTHORIZATION_SCOPE_MISMATCH" },
        status: "REJECTED_PERMISSION",
      },
    ]);

    await database.query(
      `UPDATE identity.devices
       SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [limitedDeviceId],
    );
    const revokedResponse = await get("/api/v1/auth/context", limitedSecret);
    expect(revokedResponse.status).toBe(403);
    expect(await jsonObject(revokedResponse)).toEqual({
      error: {
        code: "DEVICE_REVOKED",
        message: "Perangkat tidak lagi diizinkan.",
      },
    });
  });
});
