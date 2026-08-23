import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { _createPosLocalDatabaseInternal } from "../src/pos-database";
import { createTestDatabaseRuntime, type TestDatabaseRuntime } from "./test-runtime.js";

describe("E2E Offline Restart", () => {
  let runtime: TestDatabaseRuntime;
  let dbName: string;

  beforeEach(async () => {
    runtime = createTestDatabaseRuntime();
    dbName = runtime.createDatabaseName("pos");
  });

  afterEach(async () => {
    await runtime.cleanup();
  });

  it("M2-009: Completed sale survives browser restart (db re-instantiation)", async () => {
    // 1. Instantiate the first "browser session"
    let db = _createPosLocalDatabaseInternal({
      dependencies: runtime.dependencies,
      databaseName: dbName
    });
    
    await db.open();

    // Seed prerequisite master data
    await db.catalog.applyInitialBootstrap({
      business_id: "biz-1",
      bootstrap_version: 1,
      server_time: new Date().toISOString(),
      products: [
        { id: "prod-1", sku: "SKU1", name: "Beras", status: "ACTIVE", base_unit_code: "Kg", track_inventory: true, version: "v1", updated_at: new Date().toISOString() }
      ],
      product_units: [
        { id: "unit-1", product_id: "prod-1", unit_code: "Kg", status: "ACTIVE", conversion_factor: "1.000000", display_name: "Kilogram", can_sell: true, can_purchase: true, allow_decimal_qty: true, version: "v1", updated_at: new Date().toISOString() }
      ],
      barcodes: [
        { id: "bc-1", product_unit_id: "unit-1", barcode: "12345", status: "ACTIVE", is_internal: false, deactivated_at: null }
      ]
    });

    await db.pricing.applyInitialBootstrap({
      business_id: "biz-1",
      bootstrap_version: 1,
      server_time: new Date().toISOString(),
      prices: [
        {
          price_version_id: "pv-1",
          product_unit_id: "unit-1",
          effective_from: new Date().toISOString(),
          effective_to: null,
          unit_price: "15000.0000"
        }
      ]
    });
    // 2. Perform CompleteSale
    const txId = "123e4567-e89b-12d3-a456-426614174000";

    await db.shifts.openShift({
      auth: {
        user: { id: "cashier-1", display_name: "Cashier" },
        membership: { business_id: "biz-1", status: "ACTIVE" },
        primary_role: "CASHIER",
        permissions: ["workspace.pos.access", "pos.use", "shift.open"],
        authorization_version: 1,
        offline_valid_until: new Date(Date.now() + 100000).toISOString(),
        default_location_id: "loc-1",
        server_time: new Date().toISOString()
      },
      terminal_id: "term-1",
      device_id: "device-1",
      opening_cash: "100000.0000",
      opened_at: new Date().toISOString()
    });

    const res = await db.sales.completeSale({
      auth: {
        user: { id: "cashier-1", display_name: "Cashier" },
        membership: { business_id: "biz-1", status: "ACTIVE" },
        primary_role: "CASHIER",
        permissions: ["workspace.pos.access", "pos.use", "transaction.create", "transaction.complete", "payment.record"],
        authorization_version: 1,
        offline_valid_until: new Date(Date.now() + 100000).toISOString(),
        default_location_id: "loc-1",
        server_time: new Date().toISOString()
      },
      device_id: "device-1",
      command_id: txId,
      occurred_at: new Date().toISOString(),
      cart: {
        business_id: "biz-1",
        lines: [
          {
            product_id: "prod-1",
            product_unit_id: "unit-1",
            product_name: "Beras",
            unit_code: "Kg",
            variant_name: "",
            sku: "SKU1",
            barcode: "12345",
            allow_decimal_qty: true,
            price_version_id: "pv-1",
            price_effective_from: "2026-08-01T00:00:00Z",
            quantity: "2.000000",
            unit_price: "15000.0000",
            base_unit_price: "15000.0000",
            tier_id: "tier-retail",
            tier_code: "RETAIL",
            tier_min_qty: "1.000000",
            tier_unit_price: "15000.0000",
            promotion_id: null,
            promotion_type: null,
            promotion_value: null,
            promotion_discount: "0.0000",
            pricing_resolved_at: "2026-08-17T01:00:00Z",
            pricing_time_status: "TRUSTED",
            line_total: "30000.0000",
            conversion_factor: "1.000000",
            track_inventory: true
          }
        ]
      },
      amount_tendered: "30000.0000"
    });

    // Verify it's there
    let txRecord = await db.sales.getCompletedSale(res.transaction_id);
    expect(txRecord).toBeDefined();

    // 3. Simulate browser restart
    // Close the current connection
    db.close();
    
    // Create a fresh instance (simulating refresh/restart)
    const newDb = _createPosLocalDatabaseInternal({
      dependencies: runtime.dependencies,
      databaseName: dbName
    });
    await newDb.open();
    
    // 4. Verify data survived
    const recoveredTx = await newDb.sales.getCompletedSale(res.transaction_id);
    expect(recoveredTx).toBeDefined();
    expect(recoveredTx?.transaction.status).toBe("COMPLETED");
    expect(recoveredTx?.transaction.grand_total).toBe("30000");

    expect(recoveredTx?.items.length).toBe(1);
    expect(recoveredTx?.cash_movements).toHaveLength(1);
    expect(recoveredTx?.cash_movements[0]).toMatchObject({
      amount: "30000",
      movement_type: "CASH_SALE",
      source_id: res.transaction_id,
    });
    expect(recoveredTx?.audit_events).toHaveLength(1);
    expect(recoveredTx?.audit_events[0]).toMatchObject({
      action: "TRANSACTION_COMPLETED",
      entity_id: res.transaction_id,
    });

    const pendingOutbox = await newDb.sync.listPendingOutbox("biz-1");
    expect(pendingOutbox.some(({ command_id }) => command_id === txId)).toBe(true);
    const saleOutbox = await newDb.sync.getOutboxCommand(txId);
    expect(saleOutbox).not.toBeNull();
    expect(JSON.parse(saleOutbox!.payload)).toMatchObject({
      payload_version: 1,
      transaction: { transaction_id: res.transaction_id },
      cash_movements: [{ source_id: res.transaction_id }],
      audit_events: [{ entity_id: res.transaction_id }],
    });
  });
});
