import type { SyncBootstrapResponse, SyncPullResponse } from "@kastur/contracts";
import type { PosLocalDatabase } from "@kastur/local-db";
import { describe, expect, it, vi } from "vitest";

import {
  PosLocalSyncStoreAdapter,
  ProjectionRequiresBootstrapError,
} from "./sync-store-adapter.js";

const context = { business_id: "business-1", device_id: "device-1" } as const;

function bootstrap(): SyncBootstrapResponse {
  return {
    bootstrap_version: 1,
    server_time: "2026-08-23T00:00:00.000Z",
    business: { id: "business-1", name: "Toko", currency_code: "IDR", timezone: "Asia/Makassar" },
    location: { id: "location-1", code: "UTM", name: "Utama" },
    terminal: { id: "terminal-1", code: "POS-1", name: "Kasir 1" },
    authorization: {
      user: { id: "user-1", display_name: "Kasir" },
      membership: { business_id: "business-1", status: "ACTIVE" },
      primary_role: "CASHIER",
      permissions: ["workspace.pos.access"],
      authorization_version: 1,
      offline_valid_until: "2026-08-24T00:00:00.000Z",
      default_location_id: "location-1",
      server_time: "2026-08-23T00:00:00.000Z",
    },
    settings: { language: "id-ID", receipt_width: "80mm" },
    products: [{
      id: "product-1", sku: "SKU-1", name: "Kopi", base_unit_code: "PCS",
      track_inventory: true, status: "ACTIVE", version: "1", updated_at: "2026-08-23T00:00:00.000Z",
    }],
    product_units: [{
      id: "unit-1", product_id: "product-1", unit_code: "PCS", display_name: "Pcs",
      conversion_factor: "1", can_sell: true, can_purchase: true, allow_decimal_qty: false,
      status: "ACTIVE", version: "1", updated_at: "2026-08-23T00:00:00.000Z",
    }],
    barcodes: [{
      id: "barcode-1", product_unit_id: "unit-1", barcode: "8991", is_internal: false,
      status: "ACTIVE", deactivated_at: null,
    }],
    published_price_versions: [{
      price_version_id: "price-1", product_unit_id: "unit-1", unit_price: "12000",
      effective_from: "2026-08-23T00:00:00.000Z", effective_to: null, status: "ACTIVE",
    }],
    published_price_tiers: [{
      id: "tier-1", price_version_id: "price-1", tier_code: "RETAIL",
      min_qty: "1", unit_price: "12000", sort_order: 0,
    }, {
      id: "tier-10", price_version_id: "price-1", tier_code: "WHOLESALE",
      min_qty: "10", unit_price: "11000", sort_order: 1,
    }],
    promotions: [{
      id: "promotion-1", name: "Promo Kopi", product_unit_id: "unit-1",
      promotion_type: "PERCENT_DISCOUNT", value: "10", min_qty: "1", priority: 10,
      effective_from: "2026-08-23T00:00:00.000Z",
      effective_to: "2026-08-24T00:00:00.000Z", status: "ACTIVE", version: "1",
      created_at: "2026-08-22T00:00:00.000Z",
    }],
    payment_methods: [{
      id: "payment-1", code: "CASH", name: "Tunai", is_cash: true,
      offline_allowed: true, version: "1",
    }],
    stock_balances: [{
      business_id: "business-1",
      location_id: "location-1",
      product_id: "product-1",
      base_quantity: "5.000000",
      last_movement_id: null,
      updated_at: "2026-08-23T00:00:00.000Z",
    }],
    sync_cursor: "17",
  };
}

function fakeDatabase() {
  const sync = {
    claimOutboxBatch: vi.fn(),
    settleOutboxBatch: vi.fn(),
    getState: vi.fn().mockResolvedValue({ cursor: "17", bootstrap_version: 1 }),
    applyBootstrapSnapshot: vi.fn().mockResolvedValue(undefined),
    applyProjectionPage: vi.fn().mockResolvedValue(undefined),
  };
  return { database: { sync } as unknown as PosLocalDatabase, sync };
}

describe("PosLocalSyncStoreAdapter", () => {
  it("maps bootstrap into one scoped atomic local snapshot", async () => {
    const fake = fakeDatabase();
    const adapter = new PosLocalSyncStoreAdapter(fake.database, "device-1");
    await adapter.applyBootstrapAtomically(context, bootstrap());

    expect(fake.sync.applyBootstrapSnapshot).toHaveBeenCalledOnce();
    const input = fake.sync.applyBootstrapSnapshot.mock.calls[0]![0];
    expect(input.cursor).toBe("17");
    expect(input.products[0]).toMatchObject({ business_id: "business-1", id: "product-1" });
    expect(input.published_retail_prices[0]).toMatchObject({
      status: "ACTIVE",
      tiers: [
        expect.objectContaining({ tier_code: "RETAIL", unit_price: "12000" }),
        expect.objectContaining({ tier_code: "WHOLESALE", unit_price: "11000" }),
      ],
    });
    expect(input.opaque_projections.map((row: { entity_type: string }) => row.entity_type)).toEqual([
      "promotion", "payment_method", "stock_balance", "authorization",
    ]);
    expect(adapter.getLatestBootstrapContext()?.terminal.id).toBe("terminal-1");
  });

  it("preserves command identity while adapting a leased outbox record", async () => {
    const fake = fakeDatabase();
    fake.sync.claimOutboxBatch.mockResolvedValue([{
      outbox_id: "outbox-1", command_id: "command-1", business_id: "business-1",
      business_event_id: "sale-1", command_type: "sales.complete", schema_version: 1,
      location_id: null, device_id: "device-1", authorization_version: 4,
      correlation_id: "correlation-1", occurred_at: "2026-08-23T00:00:00.000Z",
      payload: "{\"sale\":true}", request_fingerprint: "fingerprint", created_at: "2026-08-23T00:00:00.000Z",
      attempt_count: 2, last_attempt_at: "2026-08-23T00:00:00.000Z", status: "SENDING",
      last_error: null,
    }]);
    const adapter = new PosLocalSyncStoreAdapter(fake.database, "device-1");
    const commands = await adapter.claimPushCandidates({
      ...context,
      limit: 25,
      claimed_at: "2026-08-23T00:00:00.000Z",
      lease_expires_at: "2026-08-23T00:01:00.000Z",
    });

    expect(commands[0]).toMatchObject({
      command_id: "command-1",
      device_id: "device-1",
      attempt_count: 2,
      payload: { sale: true },
    });
    expect(commands[0]).not.toHaveProperty("location_id");
  });

  it("applies event pulls and cursor together", async () => {
    const fake = fakeDatabase();
    const adapter = new PosLocalSyncStoreAdapter(fake.database, "device-1");
    const response: SyncPullResponse = {
      changes: [{
        sequence: "18", entity_type: "sales_transaction", entity_id: "sale-1",
        change_type: "EVENT", entity_version: null, occurred_at: "2026-08-23T00:01:00.000Z",
        payload: { status: "COMPLETED" },
      }],
      next_cursor: "18",
      has_more: false,
      server_time: "2026-08-23T00:01:01.000Z",
    };
    await adapter.applyPullAtomically(context, response);

    expect(fake.sync.applyProjectionPage).toHaveBeenCalledWith(expect.objectContaining({
      expected_cursor: "17",
      next_cursor: "18",
      changes: [],
      observed_events: [expect.objectContaining({ entity_type: "sales_transaction", sequence: "18" })],
    }));
  });

  it("maps an incremental published price with immutable tiers", async () => {
    const fake = fakeDatabase();
    const adapter = new PosLocalSyncStoreAdapter(fake.database, "device-1");
    const response: SyncPullResponse = {
      changes: [{
        sequence: "18",
        entity_type: "published_retail_price",
        entity_id: "price-2",
        change_type: "UPSERT",
        entity_version: "1",
        occurred_at: "2026-08-23T00:01:00.000Z",
        payload: {
          price_version_id: "price-2",
          product_unit_id: "unit-1",
          unit_price: "13000",
          effective_from: "2026-08-24T00:00:00.000Z",
          effective_to: null,
          status: "SCHEDULED",
          tiers: [{
            id: "tier-2",
            price_version_id: "price-2",
            tier_code: "RETAIL",
            min_qty: "1",
            unit_price: "13000",
            sort_order: 0,
          }],
        },
      }],
      next_cursor: "18",
      has_more: false,
      server_time: "2026-08-23T00:01:01.000Z",
    };

    await adapter.applyPullAtomically(context, response);

    expect(fake.sync.applyProjectionPage).toHaveBeenCalledWith(expect.objectContaining({
      changes: [expect.objectContaining({
        entity_type: "published_retail_price",
        value: expect.objectContaining({
          price_version_id: "price-2",
          status: "SCHEDULED",
          tiers: [expect.objectContaining({ tier_id: "tier-2" })],
        }),
      })],
    }));
  });

  it("applies a full authoritative Stock Balance projection without retaining cost", async () => {
    const fake = fakeDatabase();
    const adapter = new PosLocalSyncStoreAdapter(fake.database, "device-1");
    const response: SyncPullResponse = {
      changes: [{
        sequence: "18",
        entity_type: "stock_balance",
        entity_id: "product-1",
        change_type: "UPSERT",
        entity_version: null,
        occurred_at: "2026-08-23T00:01:00.000Z",
        payload: {
          base_quantity: "-2.000000",
          business_id: "business-1",
          last_movement_id: "movement-1",
          location_id: "location-1",
          mwa_unit_cost: "999999.0000",
          product_id: "product-1",
          updated_at: "2026-08-23T00:01:00.000Z",
        },
      }],
      next_cursor: "18",
      has_more: false,
      server_time: "2026-08-23T00:01:01.000Z",
    };

    await adapter.applyPullAtomically(context, response);

    const input = fake.sync.applyProjectionPage.mock.calls[0]![0];
    expect(input.changes).toEqual([
      expect.objectContaining({
        change_type: "UPSERT",
        entity_type: "stock_balance",
        value: expect.objectContaining({
          entity_id: "product-1",
          payload: {
            base_quantity: "-2.000000",
            business_id: "business-1",
            last_movement_id: "movement-1",
            location_id: "location-1",
            product_id: "product-1",
            updated_at: "2026-08-23T00:01:00.000Z",
          },
        }),
      }),
    ]);
    expect(input.changes[0].value.payload).not.toHaveProperty("mwa_unit_cost");
  });

  it("does not advance the cursor for an incomplete master projection", async () => {
    const fake = fakeDatabase();
    const adapter = new PosLocalSyncStoreAdapter(fake.database, "device-1");
    const response: SyncPullResponse = {
      changes: [{
        sequence: "18", entity_type: "product", entity_id: "product-2",
        change_type: "UPSERT", entity_version: "1", occurred_at: "2026-08-23T00:01:00.000Z",
        payload: { product_id: "product-2", version: "1" },
      }],
      next_cursor: "18",
      has_more: false,
      server_time: "2026-08-23T00:01:01.000Z",
    };
    await expect(adapter.applyPullAtomically(context, response)).rejects.toBeInstanceOf(
      ProjectionRequiresBootstrapError,
    );
    expect(fake.sync.applyProjectionPage).not.toHaveBeenCalled();
  });

  it("requires an atomic rebootstrap for Return-owned feed events not materialized locally", async () => {
    const fake = fakeDatabase();
    const adapter = new PosLocalSyncStoreAdapter(fake.database, "device-1");
    const response: SyncPullResponse = {
      changes: [{
        sequence: "18", entity_type: "customer_return", entity_id: "return-1",
        change_type: "EVENT", entity_version: "1", occurred_at: "2026-08-23T00:01:00.000Z",
        payload: { return_status: "COMPLETED" },
      }],
      next_cursor: "18",
      has_more: false,
      server_time: "2026-08-23T00:01:01.000Z",
    };

    await expect(adapter.applyPullAtomically(context, response)).rejects.toBeInstanceOf(
      ProjectionRequiresBootstrapError,
    );
    expect(fake.sync.applyProjectionPage).not.toHaveBeenCalled();
  });
});
