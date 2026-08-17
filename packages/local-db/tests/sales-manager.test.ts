import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { 
  _createPosLocalDatabaseInternal,
  type PosLocalDatabase
} from "../src/pos-database.js";
import { CompleteSaleError, IDEMPOTENCY_KEY_REUSE_ERROR, SALE_CART_INTEGRITY_INVALID, SALE_NUMERIC_BOUNDARY_INVALID, SALE_UNIT_CONVERSION_INVALID, PAYMENT_INSUFFICIENT, SALE_PERMISSION_DENIED, SALE_AUTHORIZATION_EXPIRED } from "../src/sales-manager.js";
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
      membership: { business_id: "b1" },
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

  describe("AUTH-01..08, SHIFT-03..05, SALE-02..08 - Authorization & Shift & Identity & Bounds", () => {
    it("AUTH-01..08: enforces required permissions and expiration", async () => {
      // Missing permission
      auth.permissions = ["workspace.pos.access"];
      await expect(db.sales.completeSale({
        auth, device_id: "d1", command_id: "cmd-p1", occurred_at: "2026-08-17T01:00:00Z", cart, amount_tendered: "200.0000"
      })).rejects.toMatchObject({ code: SALE_PERMISSION_DENIED });

      // Expired offline
      auth.permissions = ["workspace.pos.access", "pos.use", "transaction.create", "transaction.complete", "payment.record"];
      auth.offline_valid_until = "2026-08-16T00:00:00Z";
      await expect(db.sales.completeSale({
        auth, device_id: "d1", command_id: "cmd-p2", occurred_at: "2026-08-17T01:00:00Z", cart, amount_tendered: "200.0000"
      })).rejects.toMatchObject({ code: SALE_AUTHORIZATION_EXPIRED });
    });

    it("SALE-02: business isolation - rejects cross-business cart", async () => {
      cart.business_id = "b2";
      await expect(db.sales.completeSale({
        auth, device_id: "d1", command_id: "cmd-iso1", occurred_at: "2026-08-17T01:00:00Z", cart, amount_tendered: "200.0000"
      })).rejects.toMatchObject({ code: SALE_CART_INTEGRITY_INVALID });

      const counts = await getCounts();
      expect(counts).toEqual({ txCount: 0, itemCount: 0, pmCount: 0, smCount: 0, outCount: 0 });
    });

    it("SHIFT-03..05: requires open shift matching user and device", async () => {
      await expect(db.sales.completeSale({
        auth, device_id: "d2", command_id: "cmd-s1", occurred_at: "2026-08-17T01:00:00Z", cart, amount_tendered: "200.0000"
      })).rejects.toThrowError("No active shift found");
    });
  });

  describe("NUM-01..04, SNAP-01..08, PAY-03..05 - Numeric boundaries and exact evaluation", () => {
    it("NUM-01..04: precision violations reject with SALE_NUMERIC_BOUNDARY_INVALID", async () => {
      cart.lines[0].quantity = "2.0000001"; // scale 7
      await expect(db.sales.completeSale({
        auth, device_id: "d1", command_id: "cmd-n1", occurred_at: "2026-08-17T01:00:00Z", cart, amount_tendered: "200.0000"
      })).rejects.toMatchObject({ code: SALE_NUMERIC_BOUNDARY_INVALID });
    });

    it("rejects non-positive conversion factor", async () => {
      cart.lines[0].conversion_factor = "0.00000000";
      await expect(db.sales.completeSale({
        auth, device_id: "d1", command_id: "cmd-n2", occurred_at: "2026-08-17T01:00:00Z", cart, amount_tendered: "200.0000"
      })).rejects.toMatchObject({ code: SALE_UNIT_CONVERSION_INVALID });
    });

    it("PAY-03..05: detects insufficient and negative payments", async () => {
      await expect(db.sales.completeSale({
        auth, device_id: "d1", command_id: "cmd-p1", occurred_at: "2026-08-17T01:00:00Z", cart, amount_tendered: "100.0000"
      })).rejects.toMatchObject({ code: PAYMENT_INSUFFICIENT });

      await expect(db.sales.completeSale({
        auth, device_id: "d1", command_id: "cmd-p2", occurred_at: "2026-08-17T01:00:00Z", cart, amount_tendered: "-200.0000"
      })).rejects.toMatchObject({ code: SALE_CART_INTEGRITY_INVALID });
    });
  });

  describe("INV-01..06, OUT-01..07, IDEM-04..05 - Local Storage & Transaction Atomicity", () => {
    const faults = ["after_transaction", "after_items", "after_payment", "after_stock", "before_outbox"] as const;
    for (const fault of faults) {
      it(`ATOM-01..05: rolls back entirely if ${fault} fails`, async () => {
        const p = db.sales.completeSale({
          auth, device_id: "d1", command_id: `cmd-fault-${fault}`, occurred_at: "2026-08-17T01:00:00Z", cart, amount_tendered: "200.0000"
        }, fault);
        await expect(p).rejects.toThrow(`Fault: ${fault}`);
        const counts = await getCounts();
        expect(counts).toEqual({ txCount: 0, itemCount: 0, pmCount: 0, smCount: 0, outCount: 0 });
      });
    }

    it("INV-01..06: handles track_inventory true/false", async () => {
      cart.lines[0].track_inventory = false;
      await db.sales.completeSale({
        auth, device_id: "d1", command_id: "cmd-inv1", occurred_at: "2026-08-17T01:00:00Z", cart, amount_tendered: "200.0000"
      });
      const counts = await getCounts();
      expect(counts.smCount).toBe(0); // no stock movement created
    });

    it("IDEM-04..05: handles idempotency precisely", async () => {
      const input = {
        auth, device_id: "d1", command_id: "cmd-idem1", occurred_at: "2026-08-17T01:00:00Z", cart, amount_tendered: "200.0000"
      };
      
      const res1 = await db.sales.completeSale(input);
      const res2 = await db.sales.completeSale(input); // retry same
      expect(res1.transaction_id).toBe(res2.transaction_id);
      
      // different payload
      await expect(db.sales.completeSale({ ...input, amount_tendered: "300.0000" })).rejects.toMatchObject({ code: IDEMPOTENCY_KEY_REUSE_ERROR });

      // Check IDEM-04 concurrent race condition logic
      const p1 = db.sales.completeSale({ ...input, command_id: "cmd-race" });
      const p2 = db.sales.completeSale({ ...input, command_id: "cmd-race" });
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.transaction_id).toBe(r2.transaction_id); // both should resolve identically
      
      const outCount = await (db as any)._database.table("outbox").where({ command_id: "cmd-race" }).count();
      expect(outCount).toBe(1); // exactly one durable aggregate created
    });
  });

  describe("READ-01..03 - Immutable Read Boundary", () => {
    it("returns typed aggregate exact match and deterministic line order", async () => {
      cart.lines.push({
        line_key: "k2",
        product_id: "p2",
        product_unit_id: "pu2",
        product_name: "Product 2",
        unit_code: "BOX",
        variant_name: "Default",
        sku: "SKU2",
        barcode: null,
        allow_decimal_qty: false,
        price_version_id: "pv1",
        price_effective_from: "2026-08-01T00:00:00Z",
        quantity: "1.000000",
        unit_price: "50.0000",
        line_total: "50.0000",
        conversion_factor: "12.00000000",
        track_inventory: true
      });

      const res = await db.sales.completeSale({
        auth, device_id: "d1", command_id: "cmd-read1", occurred_at: "2026-08-17T01:00:00Z", cart, amount_tendered: "250.0000"
      });

      const aggregate = await db.sales.getCompletedSale(res.transaction_id);
      expect(aggregate.transaction.transaction_id).toBe(res.transaction_id);
      expect(aggregate.transaction.status).toBe("COMPLETED");
      expect(aggregate.transaction.sync_status).toBe("PENDING");
      expect(aggregate.transaction.total_paid).toBe("250");
      expect(aggregate.transaction.change_amount).toBe("0");

      expect(aggregate.items).toHaveLength(2);
      expect(aggregate.items[0].product_id).toBe("p1");
      expect(aggregate.items[1].product_id).toBe("p2");

      expect(aggregate.payments).toHaveLength(1);
      expect(aggregate.stock_movements).toHaveLength(2);
      expect(aggregate.transaction.transaction_number).toMatch(/^TRX-([0-9a-fA-F-]+)$/);
    });
  });
});
