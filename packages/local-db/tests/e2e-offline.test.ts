import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { _createPosLocalDatabaseInternal } from "../src/pos-database";
import type { PosLocalDatabase } from "../src/pos-database";
import { completeSaleLocalTransaction } from "../src/sales-manager";
import type { NormalizedSaleLine } from "../src/sales-manager";
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
      name: dbName
    });
    
    await db.open();

    // Seed prerequisite master data
    await db.catalog.applyInitialBootstrap({
      business_id: "biz-1",
      bootstrap_version: 1,
      server_time: new Date().toISOString(),
      products: [
        { id: "prod-1", business_id: "biz-1", sku: "SKU1", name: "Beras", status: "ACTIVE" }
      ],
      product_units: [
        { id: "unit-1", business_id: "biz-1", product_id: "prod-1", unit_code: "Kg", status: "ACTIVE", conversion_factor: "1.000000" }
      ],
      barcodes: [
        { id: "bc-1", business_id: "biz-1", product_unit_id: "unit-1", barcode: "12345", status: "ACTIVE" }
      ]
    });

    await db.pricing.applyInitialBootstrap({
      business_id: "biz-1",
      bootstrap_version: 1,
      server_time: new Date().toISOString(),
      prices: [
        {
          price_version_id: "pv-1",
          business_id: "biz-1",
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
      business_id: "biz-1",
      shift_id: "shift-1",
      shift_number: "SHF-1",
      location_id: "loc-1",
      terminal_id: "term-1",
      device_id: "device-1",
      cashier_user_id: "cashier-1",
      opening_cash: "100000.0000",
      opened_at: new Date().toISOString(),
      authorization_version: 1,
      correlation_id: "corr-1"
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
            line_key: "k1",
            product_id: "prod-1",
            product_unit_id: "unit-1",
            product_name: "Beras",
            unit_code: "Kg",
            variant_name: null,
            sku: "SKU1",
            barcode: "12345",
            allow_decimal_qty: true,
            price_version_id: "pv-1",
            price_effective_from: "2026-08-01T00:00:00Z",
            quantity: "2.000000",
            unit_price: "15000.0000",
            line_total: "30000.0000",
            conversion_factor: "1.000000",
            track_inventory: true
          }
        ],
        amount_total: "30000.0000",
        tax_total: "0.0000"
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
      name: dbName
    });
    await newDb.open();
    
    // 4. Verify data survived
    const recoveredTx = await newDb.sales.getCompletedSale(res.transaction_id);
    expect(recoveredTx).toBeDefined();
    expect(recoveredTx?.transaction.status).toBe("COMPLETED");
    expect(recoveredTx?.transaction.grand_total).toBe("30000");

    expect(recoveredTx?.items.length).toBe(1);
    const outboxCount = await (newDb as any)._database.table("outbox").where({ command_id: txId }).count();
    expect(outboxCount).toBeGreaterThan(0);
  });
});
