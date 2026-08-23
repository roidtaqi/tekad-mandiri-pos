import type { AuthContextResponse } from "@kastur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildOpaqueProjectionKey,
  SYNC_CURSOR_MISMATCH,
  SYNC_INVALID_INPUT,
  SYNC_OUTBOX_LEASE_MISMATCH,
} from "../src/index.js";
import {
  _createPosLocalDatabaseInternal,
  type PosLocalDatabase,
} from "../src/pos-database.js";
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from "./test-runtime.js";

const auth: AuthContextResponse = {
  user: { id: "user-1", display_name: "Kasir" },
  membership: { business_id: "business-1", status: "ACTIVE" },
  primary_role: "CASHIER",
  permissions: ["workspace.pos.access", "shift.open"],
  authorization_version: 1,
  offline_valid_until: "2099-12-31T23:59:59Z",
  default_location_id: "location-1",
  server_time: "2026-08-17T00:00:00Z",
  offline_authorization: {
    schema_version: 1,
    algorithm: "ECDSA_P256_SHA256",
    key_id: "offline-test-1",
    session_id: "session-1",
    device_id: "device-1",
    terminal_id: "terminal-1",
    issued_at: "2026-08-17T00:00:00Z",
    offline_valid_until: "2099-12-31T23:59:59Z",
    authorization: {
      user_id: "user-1",
      business_id: "business-1",
      primary_role: "CASHIER",
      permissions: ["workspace.pos.access", "shift.open"],
      authorization_version: 1,
      default_location_id: "location-1",
    },
    signature: "durable-signed-proof",
  },
};

describe("PosSyncStore", () => {
  let database: PosLocalDatabase;
  let databaseName: string;
  let runtime: TestDatabaseRuntime;

  beforeEach(async () => {
    runtime = createTestDatabaseRuntime();
    databaseName = runtime.createDatabaseName("sync-store");
    database = _createPosLocalDatabaseInternal({
      databaseName,
      dependencies: runtime.dependencies,
    });
    await database.open();
  });

  afterEach(async () => {
    database.close();
    await runtime.cleanup();
  });

  async function openShift(): Promise<string> {
    const shift = await database.shifts.openShift({
      auth,
      device_id: "device-1",
      terminal_id: "terminal-1",
      opening_cash: "100000",
      opened_at: "2026-08-17T01:00:00Z",
    });
    return shift.shift_id;
  }

  it("claims pending commands atomically and recovers an expired lease after restart", async () => {
    const commandId = await openShift();
    const firstClaim = await database.sync.claimOutboxBatch({
      business_id: "business-1",
      lease_owner: "worker-1",
      claimed_at: "2026-08-17T02:00:00Z",
      lease_expires_at: "2026-08-17T02:05:00Z",
    });
    expect(firstClaim).toEqual([
      expect.objectContaining({
        attempt_count: 1,
        command_id: commandId,
        lease_owner: "worker-1",
        offline_authorization: auth.offline_authorization,
        status: "SENDING",
      }),
    ]);

    database.close();
    database = _createPosLocalDatabaseInternal({
      databaseName,
      dependencies: runtime.dependencies,
    });
    await database.open();

    await expect(
      database.sync.claimOutboxBatch({
        business_id: "business-1",
        lease_owner: "worker-2",
        claimed_at: "2026-08-17T02:04:00Z",
        lease_expires_at: "2026-08-17T02:09:00Z",
      }),
    ).resolves.toEqual([]);

    const recoveredClaim = await database.sync.claimOutboxBatch({
      business_id: "business-1",
      lease_owner: "worker-2",
      claimed_at: "2026-08-17T02:05:00Z",
      lease_expires_at: "2026-08-17T02:10:00Z",
    });
    expect(recoveredClaim).toEqual([
      expect.objectContaining({
        attempt_count: 2,
        command_id: commandId,
        lease_owner: "worker-2",
        offline_authorization: auth.offline_authorization,
        status: "SENDING",
      }),
    ]);
  });

  it("settles an owned claim atomically and rejects a foreign lease", async () => {
    const commandId = await openShift();
    await database.sync.claimOutboxBatch({
      business_id: "business-1",
      lease_owner: "worker-1",
      claimed_at: "2026-08-17T02:00:00Z",
      lease_expires_at: "2026-08-17T02:05:00Z",
    });

    await expect(
      database.sync.settleOutboxBatch("worker-other", [
        {
          command_id: commandId,
          disposition: "ACCEPTED",
          error: null,
        },
      ]),
    ).rejects.toMatchObject({ code: SYNC_OUTBOX_LEASE_MISMATCH });
    await expect(database.sync.getOutboxCommand(commandId)).resolves.toMatchObject({
      status: "SENDING",
    });

    await database.sync.settleOutboxBatch("worker-1", [
      {
        command_id: commandId,
        disposition: "ACCEPTED",
        error: null,
      },
    ]);

    await expect(database.sync.getOutboxCommand(commandId)).resolves.toMatchObject({
      lease_owner: null,
      status: "ACCEPTED",
    });
    await expect(
      database.shifts.getActiveShift("business-1", "location-1", "device-1"),
    ).resolves.toMatchObject({ sync_status: "SYNCED" });
    await expect(
      database.audit.getEventsForEntity("business-1", "CASH_SHIFT", commandId),
    ).resolves.toEqual([
      expect.objectContaining({ sync_status: "SYNCED" }),
    ]);
  });

  it("holds retryable commands until next_attempt_at, preserving command identity", async () => {
    const commandId = await openShift();
    await database.sync.claimOutboxBatch({
      business_id: "business-1",
      lease_owner: "worker-1",
      claimed_at: "2026-08-17T02:00:00Z",
      lease_expires_at: "2026-08-17T02:05:00Z",
    });
    await database.sync.settleOutboxBatch("worker-1", [
      {
        command_id: commandId,
        disposition: "FAILED_RETRYABLE",
        error: "UNKNOWN_RESULT",
        next_attempt_at: "2026-08-17T02:10:00Z",
      },
    ]);

    await expect(
      database.sync.claimOutboxBatch({
        business_id: "business-1",
        lease_owner: "worker-2",
        claimed_at: "2026-08-17T02:09:59Z",
        lease_expires_at: "2026-08-17T02:14:59Z",
      }),
    ).resolves.toEqual([]);
    await expect(
      database.sync.claimOutboxBatch({
        business_id: "business-1",
        lease_owner: "worker-2",
        claimed_at: "2026-08-17T02:10:00Z",
        lease_expires_at: "2026-08-17T02:15:00Z",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        attempt_count: 2,
        command_id: commandId,
        status: "SENDING",
      }),
    ]);
  });

  it("summarizes every unresolved outbox state, including retry and review", async () => {
    const commandId = await openShift();
    await expect(database.sync.getOutboxSummary("business-1")).resolves.toEqual({
      pending: 1,
      sending: 0,
      failed_retryable: 0,
      requires_review: 0,
      unresolved: 1,
    });

    await database.sync.claimOutboxBatch({
      business_id: "business-1",
      lease_owner: "worker-1",
      claimed_at: "2026-08-17T02:00:00Z",
      lease_expires_at: "2026-08-17T02:05:00Z",
    });
    await expect(database.sync.getOutboxSummary("business-1")).resolves.toMatchObject({
      sending: 1,
      unresolved: 1,
    });

    await database.sync.settleOutboxBatch("worker-1", [
      {
        command_id: commandId,
        disposition: "FAILED_RETRYABLE",
        error: "NETWORK",
        next_attempt_at: "2026-08-17T02:10:00Z",
      },
    ]);
    await expect(database.sync.getOutboxSummary("business-1")).resolves.toMatchObject({
      failed_retryable: 1,
      unresolved: 1,
    });

    await database.sync.claimOutboxBatch({
      business_id: "business-1",
      lease_owner: "worker-2",
      claimed_at: "2026-08-17T02:10:00Z",
      lease_expires_at: "2026-08-17T02:15:00Z",
    });
    await database.sync.settleOutboxBatch("worker-2", [
      {
        command_id: commandId,
        disposition: "REQUIRES_REVIEW",
        error: "CONFLICT",
      },
    ]);
    await expect(database.sync.getOutboxSummary("business-1")).resolves.toEqual({
      pending: 0,
      sending: 0,
      failed_retryable: 0,
      requires_review: 1,
      unresolved: 1,
    });
  });

  it("bootstraps and reboots scoped projections atomically without touching pending outbox", async () => {
    const commandId = await openShift();
    const projectionKey = buildOpaqueProjectionKey("business-1", "cash");
    const baseSnapshot = {
      business_id: "business-1",
      device_id: "device-1",
      bootstrap_version: 1 as const,
      cursor: "10",
      server_time: "2026-08-17T03:00:00Z",
      applied_at: "2026-08-17T03:00:01Z",
      products: [
        {
          id: "product-1",
          business_id: "business-1",
          sku: "SKU-1",
          name: "Produk 1",
          base_unit_code: "PCS",
          track_inventory: true,
          status: "ACTIVE" as const,
          version: "1",
          updated_at: "2026-08-17T03:00:00Z",
        },
      ],
      product_units: [
        {
          id: "unit-1",
          business_id: "business-1",
          product_id: "product-1",
          unit_code: "PCS",
          display_name: "Satuan",
          conversion_factor: "1",
          can_sell: true,
          can_purchase: true,
          allow_decimal_qty: false,
          status: "ACTIVE" as const,
          version: "1",
          updated_at: "2026-08-17T03:00:00Z",
        },
      ],
      barcodes: [
        {
          id: "barcode-1",
          business_id: "business-1",
          product_unit_id: "unit-1",
          barcode: "8990001",
          is_internal: false,
          status: "ACTIVE" as const,
          deactivated_at: null,
        },
      ],
      published_retail_prices: [
        {
          price_version_id: "price-1",
          business_id: "business-1",
          product_unit_id: "unit-1",
          unit_price: "1000",
          effective_from: "2026-08-17T00:00:00Z",
          effective_to: null,
          status: "ACTIVE" as const,
          tiers: [{
            tier_id: "tier-1",
            tier_code: "RETAIL",
            min_qty: "1",
            unit_price: "1000",
            sort_order: 0,
          }],
        },
      ],
      opaque_projections: [
        {
          entity_type: "payment_method" as const,
          value: {
            key: projectionKey,
            business_id: "business-1",
            entity_id: "cash",
            entity_version: "1",
            payload: { code: "CASH", status: "ACTIVE" },
            updated_at: "2026-08-17T03:00:00Z",
          },
        },
      ],
    };

    await database.sync.applyBootstrapSnapshot(baseSnapshot);
    await expect(database.sync.getState("business-1", "device-1")).resolves.toMatchObject({
      cursor: "10",
    });
    await expect(
      database.sync.getOpaqueProjection("payment_method", "business-1", "cash"),
    ).resolves.toMatchObject({ payload: { code: "CASH", status: "ACTIVE" } });
    await expect(database.sync.getOutboxCommand(commandId)).resolves.toMatchObject({
      status: "PENDING",
    });

    await database.sync.applyBootstrapSnapshot({
      ...baseSnapshot,
      cursor: "20",
      products: [{ ...baseSnapshot.products[0]!, name: "Produk setelah reboot" }],
      opaque_projections: [],
    });
    await expect(database.catalog.listProducts("business-1")).resolves.toEqual([
      expect.objectContaining({ name: "Produk setelah reboot" }),
    ]);
    await expect(
      database.sync.getOpaqueProjection("payment_method", "business-1", "cash"),
    ).resolves.toBeNull();
    await expect(database.sync.getOutboxCommand(commandId)).resolves.toMatchObject({
      status: "PENDING",
    });
    await expect(database.sync.getState("business-1", "device-1")).resolves.toMatchObject({
      cursor: "20",
    });
  });

  it("applies a projection page and cursor in one transaction, rolling back mismatches", async () => {
    await database.sync.applyProjectionPage({
      business_id: "business-1",
      device_id: "device-1",
      expected_cursor: "0",
      next_cursor: "2",
      bootstrap_version: 1,
      server_time: "2026-08-17T03:00:00Z",
      applied_at: "2026-08-17T03:00:01Z",
      changes: [
        {
          sequence: "1",
          entity_type: "product",
          change_type: "UPSERT",
          value: {
            id: "product-1",
            business_id: "business-1",
            sku: "SKU-1",
            name: "Produk awal",
            base_unit_code: "PCS",
            track_inventory: true,
            status: "ACTIVE",
            version: "1",
            updated_at: "2026-08-17T03:00:00Z",
          },
        },
      ],
      observed_events: [
        {
          sequence: "2",
          business_id: "business-1",
          entity_type: "sales_transaction",
          entity_id: "sale-device-b",
          occurred_at: "2026-08-17T02:59:00Z",
          payload: { transaction_id: "sale-device-b" },
        },
      ],
    });

    await expect(database.sync.getState("business-1", "device-1")).resolves.toMatchObject({
      cursor: "2",
    });
    await expect(
      database.sync.listObservedEvents("business-1", "sales_transaction"),
    ).resolves.toEqual([
      expect.objectContaining({ entity_id: "sale-device-b", sequence: "2" }),
    ]);

    await expect(
      database.sync.applyProjectionPage({
        business_id: "business-1",
        device_id: "device-1",
        expected_cursor: "1",
        next_cursor: "3",
        bootstrap_version: 1,
        server_time: "2026-08-17T03:01:00Z",
        applied_at: "2026-08-17T03:01:01Z",
        changes: [],
      }),
    ).rejects.toMatchObject({ code: SYNC_CURSOR_MISMATCH });

    await expect(
      database.sync.applyProjectionPage({
        business_id: "business-1",
        device_id: "device-1",
        expected_cursor: "2",
        next_cursor: "4",
        bootstrap_version: 1,
        server_time: "2026-08-17T03:02:00Z",
        applied_at: "2026-08-17T03:02:01Z",
        changes: [
          {
            sequence: "3",
            entity_type: "product",
            change_type: "UPSERT",
            value: {
              id: "product-1",
              business_id: "business-1",
              sku: "SKU-1",
              name: "Tidak boleh tersimpan",
              base_unit_code: "PCS",
              track_inventory: true,
              status: "ACTIVE",
              version: "2",
              updated_at: "2026-08-17T03:02:00Z",
            },
          },
          {
            sequence: "4",
            entity_type: "product",
            change_type: "UPSERT",
            value: {
              id: "product-cross-business",
              business_id: "business-other",
              sku: "SKU-X",
              name: "Invalid",
              base_unit_code: "PCS",
              track_inventory: true,
              status: "ACTIVE",
              version: "1",
              updated_at: "2026-08-17T03:02:00Z",
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: SYNC_INVALID_INPUT });

    await expect(database.catalog.listProducts("business-1")).resolves.toEqual([
      expect.objectContaining({ name: "Produk awal" }),
    ]);
    await expect(database.sync.getState("business-1", "device-1")).resolves.toMatchObject({
      cursor: "2",
    });
  });

  it("persists an incremental negative Stock Balance with its cursor atomically", async () => {
    const projectionKey = buildOpaqueProjectionKey("business-1", "product-1");
    await database.sync.applyProjectionPage({
      business_id: "business-1",
      device_id: "device-1",
      expected_cursor: "0",
      next_cursor: "18",
      bootstrap_version: 1,
      server_time: "2026-08-23T00:01:01Z",
      applied_at: "2026-08-23T00:01:02Z",
      changes: [
        {
          sequence: "18",
          entity_type: "stock_balance",
          change_type: "UPSERT",
          value: {
            key: projectionKey,
            business_id: "business-1",
            entity_id: "product-1",
            entity_version: null,
            payload: {
              base_quantity: "-2.000000",
              business_id: "business-1",
              last_movement_id: "movement-sale-1",
              location_id: "location-1",
              product_id: "product-1",
              updated_at: "2026-08-23T00:01:00Z",
            },
            updated_at: "2026-08-23T00:01:00Z",
          },
        },
      ],
    });

    await expect(
      database.sync.getOpaqueProjection(
        "stock_balance",
        "business-1",
        "product-1",
      ),
    ).resolves.toMatchObject({
      key: projectionKey,
      payload: {
        base_quantity: "-2.000000",
        last_movement_id: "movement-sale-1",
        location_id: "location-1",
      },
    });
    await expect(database.sync.getState("business-1", "device-1")).resolves.toMatchObject({
      cursor: "18",
    });
  });
});
