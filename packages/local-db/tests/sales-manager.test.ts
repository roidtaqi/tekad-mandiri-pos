import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { 
  _createPosLocalDatabaseInternal,
  type PosLocalDatabase
} from "../src/pos-database.js";
import { CompleteSaleError, IDEMPOTENCY_KEY_REUSE_ERROR } from "../src/sales-manager.js";
import { createTestDatabaseRuntime, type TestDatabaseRuntime } from "./test-runtime.js";

describe("PosSalesManager", () => {
  let db: PosLocalDatabase;
  let runtime: TestDatabaseRuntime;
  let dbName: string;
  let auth: any;
  let cart: any;

  afterEach(async () => {
    db.close();
    await runtime.cleanup();
  });

  beforeEach(async () => {
    runtime = createTestDatabaseRuntime();
    dbName = runtime.createDatabaseName("pos");
    db = _createPosLocalDatabaseInternal({
      dependencies: runtime.dependencies,
      databaseName: dbName,
    });

    await db.open();

    // setup shift
    await (db as any)._database.table("shifts").add({
      shift_id: "s1",
      shift_number: "S-1",
      business_id: "b1",
      location_id: "l1",
      cashier_user_id: "u1",
      device_id: "d1",
      terminal_id: "t1",
      status: "OPEN",
      sync_status: "PENDING",
      opening_cash: "100000.0000",
      opened_at: "2026-08-17T00:00:00Z",
      authorization_version: 1,
      active_context_key: '["b1","l1","d1"]'
    });

    auth = {
      user: { id: "u1" },
      membership: { 
        business_id: "b1", 
      },
      permissions: ["workspace.pos.access", "pos.use", "transaction.create", "transaction.complete", "payment.record"],
      default_location_id: "l1",
      authorization_version: 1,
      offline_valid_until: "2029-01-01T00:00:00Z"
    };

    cart = {
      business_id: "b1",
      lines: [
        {
          line_key: "k1",
          product_id: "p1",
          product_unit_id: "pu1",
          product_name: "Product 1",
          unit_code: "PCS",
          variant_name: "Default",
          sku: "SKU1",
          barcode: null,
          allow_decimal_qty: false,
          price_version_id: "pv1",
          price_effective_from: "2026-08-01T00:00:00Z",
          quantity: "2.000000",
          unit_price: "100.0000",
          line_total: "200.0000",
          conversion_factor: "1.00000000",
          track_inventory: true
        }
      ]
    };
  });

  const getCounts = async () => {
    const txCount = await (db as any)._database.table("transactions").count();
    const itemCount = await (db as any)._database.table("transaction_items").count();
    const pmCount = await (db as any)._database.table("payments").count();
    const smCount = await (db as any)._database.table("stock_movements").count();
    const outCount = await (db as any)._database.table("outbox").count();
    return { txCount, itemCount, pmCount, smCount, outCount };
  };

  it("completes a sale successfully", async () => {
    const res = await db.sales.completeSale({
      auth,
      device_id: "d1",
      command_id: "cmd1",
      occurred_at: "2026-08-17T01:00:00Z",
      cart,
      amount_tendered: "200.0000"
    });
    expect(res.transaction_id).toBeDefined();

    const counts = await getCounts();
    expect(counts).toEqual({ txCount: 1, itemCount: 1, pmCount: 1, smCount: 1, outCount: 1 });
  });

  it("handles idempotency correctly", async () => {
    const input = {
      auth,
      device_id: "d1",
      command_id: "cmd-idem",
      occurred_at: "2026-08-17T01:00:00Z",
      cart,
      amount_tendered: "200.0000"
    };
    
    const res1 = await db.sales.completeSale(input);
    const res2 = await db.sales.completeSale(input);

    expect(res1.transaction_id).toBe(res2.transaction_id);
    const counts = await getCounts();
    expect(counts.txCount).toBe(1);

    // with different fingerprint -> IDEMPOTENCY_KEY_REUSE_ERROR
    await expect(db.sales.completeSale({ ...input, amount_tendered: "300.0000" })).rejects.toThrowError(CompleteSaleError);
    await expect(db.sales.completeSale({ ...input, amount_tendered: "300.0000" })).rejects.toMatchObject({ code: IDEMPOTENCY_KEY_REUSE_ERROR });
  });

  describe("fault seams rollback", () => {
    const faults = ["after_transaction", "after_items", "after_payment", "after_stock", "before_outbox"] as const;
    
    for (const fault of faults) {
      it(`rolls back entirely if ${fault} fails`, async () => {
        const p = db.sales.completeSale({
          auth,
          device_id: "d1",
          command_id: `cmd-fault-${fault}`,
          occurred_at: "2026-08-17T01:00:00Z",
          cart,
          amount_tendered: "200.0000",
          _faultSeam: fault
        });
        
        await expect(p).rejects.toThrow(`Fault: ${fault}`);

        const counts = await getCounts();
        expect(counts).toEqual({ txCount: 0, itemCount: 0, pmCount: 0, smCount: 0, outCount: 0 });
      });
    }
  });

  it("validates shift", async () => {
    await expect(db.sales.completeSale({
      auth,
      device_id: "d2", // different device
      command_id: "cmd3",
      occurred_at: "2026-08-17T01:00:00Z",
      cart,
      amount_tendered: "200.0000"
    })).rejects.toThrowError("No active shift found");
  });

  it("re-evaluates cash settlement", async () => {
    await expect(db.sales.completeSale({
      auth,
      device_id: "d1",
      command_id: "cmd4",
      occurred_at: "2026-08-17T01:00:00Z",
      cart,
      amount_tendered: "100.0000" // insufficient
    })).rejects.toMatchObject({ code: "PAYMENT_INSUFFICIENT" });
  });
});
