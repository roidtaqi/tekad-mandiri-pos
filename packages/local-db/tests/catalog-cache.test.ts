import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPosLocalDatabase,
  type PosLocalDatabase,
} from "../src/pos-database";
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from "./test-runtime";
import type { PosCatalogBootstrapSnapshot } from "@kastur/contracts";

let runtime: TestDatabaseRuntime;

beforeEach(() => {
  runtime = createTestDatabaseRuntime();
});

afterEach(async () => {
  await runtime.cleanup();
});

describe("POS Catalog Cache Bootstrap", () => {
  let db: PosLocalDatabase;
  const businessA = "bus-A";
  const businessB = "bus-B";

  beforeEach(async () => {
    db = runtime.track(
      createPosLocalDatabase({
        databaseName: runtime.createDatabaseName("pos"),
        dependencies: runtime.dependencies,
      }),
    );
    await db.open();
  });

  const createSnapshot = (
    businessId: string,
    overrides?: Partial<PosCatalogBootstrapSnapshot>
  ): PosCatalogBootstrapSnapshot => ({
    bootstrap_version: 1,
    business_id: businessId,
    server_time: "2026-08-17T00:00:00Z",
    products: [
      {
        id: "p1",
        sku: "SKU-1",
        name: "Product 1",
        base_unit_code: "PCS",
        track_inventory: true,
        status: "ACTIVE",
        version: "v1",
        updated_at: "2026-08-17T00:00:00Z",
        ...((overrides as any)?.extraProductData || {})
      },
    ],
    product_units: [
      {
        id: "u1",
        product_id: "p1",
        unit_code: "PCS",
        display_name: "Pieces",
        conversion_factor: "1",
        can_sell: true,
        can_purchase: true,
        allow_decimal_qty: false,
        status: "ACTIVE",
        version: "v1",
        updated_at: "2026-08-17T00:00:00Z",
      },
    ],
    barcodes: [
      {
        id: "b1",
        product_unit_id: "u1",
        barcode: "00123",
        is_internal: false,
        status: "ACTIVE",
        deactivated_at: null,
      },
    ],
    ...overrides,
  });

  it("applies valid initial bootstrap with add-only semantics", async () => {
    const snap = createSnapshot(businessA);
    await db.catalog.applyInitialBootstrap(snap);

    const products = await db.catalog.listProducts(businessA);
    expect(products).toHaveLength(1);
    expect(products[0].sku).toBe("SKU-1");
    // Ensure conversion_factor remains string
    const units = await db.catalog.listProductUnits(businessA);
    expect(units).toHaveLength(1);
    expect(units[0].conversion_factor).toBe("1");
    expect(typeof units[0].conversion_factor).toBe("string");

    // Ensure leading-zero barcode is preserved
    const barcodes = await db.catalog.listBarcodes(businessA);
    expect(barcodes).toHaveLength(1);
    expect(barcodes[0].barcode).toBe("00123");
    expect(typeof barcodes[0].barcode).toBe("string");

    const state = await db.catalog.getBootstrapState(businessA);
    expect(state?.business_id).toBe(businessA);
  });

  it("drops unsafe fields not part of the contract", async () => {
    // Inject extra data safely bypassing TypeScript
    const snap = createSnapshot(businessA);
    const unsafeSnap = { ...snap } as any;
    unsafeSnap.products[0].cost = 1000;
    unsafeSnap.products[0].stock = 50;
    unsafeSnap.products[0].supplier = "Acme";

    await db.catalog.applyInitialBootstrap(unsafeSnap);

    const products = await db.catalog.listProducts(businessA);
    expect(products).toHaveLength(1);
    expect(products[0]).not.toHaveProperty("cost");
    expect(products[0]).not.toHaveProperty("stock");
    expect(products[0]).not.toHaveProperty("supplier");
  });

  it("rejects duplicate repeat bootstrap for the same business", async () => {
    const snap = createSnapshot(businessA);
    await db.catalog.applyInitialBootstrap(snap);

    await expect(db.catalog.applyInitialBootstrap(snap)).rejects.toThrow(
      "Catalog is already bootstrapped for business: bus-A"
    );
  });

  it("isolates multiple businesses safely", async () => {
    const snapA = createSnapshot(businessA);
    const snapB = createSnapshot(businessB, {
      products: [
        {
          id: "p2",
          sku: "SKU-2",
          name: "Product 2 B",
          base_unit_code: "BOX",
          track_inventory: false,
          status: "ACTIVE",
          version: "v1",
          updated_at: "2026-08-17T00:00:00Z",
        },
      ],
      product_units: [
        {
          id: "u2",
          product_id: "p2",
          unit_code: "BOX",
          display_name: "Boxes",
          conversion_factor: "1",
          can_sell: true,
          can_purchase: false,
          allow_decimal_qty: false,
          status: "ACTIVE",
          version: "v1",
          updated_at: "2026-08-17T00:00:00Z",
        },
      ],
      barcodes: [
        {
          id: "b2",
          product_unit_id: "u2",
          barcode: "00123", // same barcode, different business
          is_internal: false,
          status: "ACTIVE",
          deactivated_at: null,
        },
      ],
    });

    await db.catalog.applyInitialBootstrap(snapA);
    await db.catalog.applyInitialBootstrap(snapB);

    const productsA = await db.catalog.listProducts(businessA);
    expect(productsA).toHaveLength(1);
    expect(productsA[0].id).toBe("p1");

    const productsB = await db.catalog.listProducts(businessB);
    expect(productsB).toHaveLength(1);
    expect(productsB[0].id).toBe("p2");

    const barcodesA = await db.catalog.listBarcodes(businessA);
    expect(barcodesA[0].barcode).toBe("00123");
    
    const barcodesB = await db.catalog.listBarcodes(businessB);
    expect(barcodesB[0].barcode).toBe("00123");
  });

  it("rolls back atomically on referential integrity failure", async () => {
    const snap = createSnapshot(businessA);
    const badSnap = {
      ...snap,
      product_units: [
        ...snap.product_units,
        {
          id: "u99",
          product_id: "missing-p",
          unit_code: "KG",
          display_name: "Kg",
          conversion_factor: "1",
          can_sell: true,
          can_purchase: true,
          allow_decimal_qty: true,
          status: "ACTIVE" as const,
          version: "v1",
          updated_at: "2026-08-17T00:00:00Z",
        }
      ]
    };

    await expect(db.catalog.applyInitialBootstrap(badSnap)).rejects.toThrow("Dangling ProductUnit.product_id");

    const products = await db.catalog.listProducts(businessA);
    expect(products).toHaveLength(0); // Nothing written
  });

  it("handles duplicate ACTIVE barcodes in the same snapshot by failing", async () => {
    const snap = createSnapshot(businessA);
    const badSnap = {
      ...snap,
      barcodes: [
        ...snap.barcodes,
        {
          id: "b2",
          product_unit_id: "u1",
          barcode: "00123", // Same active barcode as b1
          is_internal: false,
          status: "ACTIVE" as const,
          deactivated_at: null,
        }
      ]
    };
    await expect(db.catalog.applyInitialBootstrap(badSnap)).rejects.toThrow("Duplicate ACTIVE barcode for same business");
  });

  it("allows INACTIVE and ACTIVE same barcode in the same snapshot", async () => {
    const snap = createSnapshot(businessA);
    const okSnap = {
      ...snap,
      barcodes: [
        ...snap.barcodes, // b1 is ACTIVE '00123'
        {
          id: "b2",
          product_unit_id: "u1",
          barcode: "00123", // Same barcode, but INACTIVE
          is_internal: false,
          status: "INACTIVE" as const,
          deactivated_at: "2026-08-17T00:00:00Z",
        }
      ]
    };
    await expect(db.catalog.applyInitialBootstrap(okSnap)).resolves.not.toThrow();
    
    const barcodes = await db.catalog.listBarcodes(businessA);
    expect(barcodes).toHaveLength(2);
  });
});
