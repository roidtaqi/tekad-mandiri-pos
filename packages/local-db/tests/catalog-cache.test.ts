import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type PosLocalDatabase,
  _createPosLocalDatabaseInternal,
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
      _createPosLocalDatabaseInternal({
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
        ...((overrides as any)?.extraProductData)
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
    expect(products[0]!.sku).toBe("SKU-1");
    // Ensure conversion_factor remains string
    const units = await db.catalog.listProductUnits(businessA);
    expect(units).toHaveLength(1);
    expect(units[0]!.conversion_factor).toBe("1");
    expect(typeof units[0]!.conversion_factor).toBe("string");

    // Ensure leading-zero barcode is preserved
    const barcodes = await db.catalog.listBarcodes(businessA);
    expect(barcodes).toHaveLength(1);
    expect(barcodes[0]!.barcode).toBe("00123");
    expect(typeof barcodes[0]!.barcode).toBe("string");

    const state = await db.catalog.getBootstrapState(businessA);
    expect(state?.business_id).toBe(businessA);
  });

  it("drops unsafe fields not part of the contract", async () => {
    // Inject extra data safely bypassing TypeScript
    const snap = createSnapshot(businessA);
    const unsafeSnap = { ...snap } as any;
    unsafeSnap.products[0]!.cost = 1000;
    unsafeSnap.products[0]!.stock = 50;
    unsafeSnap.products[0]!.supplier = "Acme";

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
    expect(productsA[0]!.id).toBe("p1");

    const productsB = await db.catalog.listProducts(businessB);
    expect(productsB).toHaveLength(1);
    expect(productsB[0]!.id).toBe("p2");

    const barcodesA = await db.catalog.listBarcodes(businessA);
    expect(barcodesA[0]!.barcode).toBe("00123");
    
    const barcodesB = await db.catalog.listBarcodes(businessB);
    expect(barcodesB[0]!.barcode).toBe("00123");
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

  it("validates runtime status exactly", async () => {
    let snap = createSnapshot(businessA);
    (snap.products[0] as any).status = "DELETED";
    await expect(db.catalog.applyInitialBootstrap(snap)).rejects.toThrow("Invalid Product.status: DELETED");

    snap = createSnapshot(businessA);
    (snap.product_units[0] as any).status = "DRAFT";
    await expect(db.catalog.applyInitialBootstrap(snap)).rejects.toThrow("Invalid ProductUnit.status: DRAFT");

    snap = createSnapshot(businessA);
    (snap.barcodes[0] as any).status = "REVOKED";
    await expect(db.catalog.applyInitialBootstrap(snap)).rejects.toThrow("Invalid Barcode.status: REVOKED");

    const products = await db.catalog.listProducts(businessA);
    expect(products).toHaveLength(0); // Nothing written
  });

  it("rejects non-string conversion_factor", async () => {
    const snap = createSnapshot(businessA);
    (snap.product_units[0] as any).conversion_factor = 1;
    await expect(db.catalog.applyInitialBootstrap(snap)).rejects.toThrow("ProductUnit.conversion_factor must be a string");
  });

  it("preserves exact decimal string without normalizing", async () => {
    const snap = createSnapshot(businessA);
    (snap.product_units[0]! as any).conversion_factor = "6.50000000";
    await db.catalog.applyInitialBootstrap(snap);

    const units = await db.catalog.listProductUnits(businessA);
    expect(units[0]!.conversion_factor).toBe("6.50000000");
  });

  it("rewrites injected child business_id to match snapshot", async () => {
    const snap = createSnapshot(businessA);
    (snap.products[0] as any).business_id = "evil-business";
    (snap.product_units[0] as any).business_id = "evil-business";
    (snap.barcodes[0] as any).business_id = "evil-business";

    await db.catalog.applyInitialBootstrap(snap);

    const products = await db.catalog.listProducts(businessA);
    expect(products[0]!.business_id).toBe(businessA);
    
    const units = await db.catalog.listProductUnits(businessA);
    expect(units[0]!.business_id).toBe(businessA);

    const barcodes = await db.catalog.listBarcodes(businessA);
    expect(barcodes[0]!.business_id).toBe(businessA);
  });

  it("preserves original data byte-for-byte on repeat bootstrap", async () => {
    const snap = createSnapshot(businessA);
    await db.catalog.applyInitialBootstrap(snap);

    const originalProducts = await db.catalog.listProducts(businessA);
    
    const snap2 = createSnapshot(businessA);
    (snap2.products[0]! as any).name = "Mutated name";

    await expect(db.catalog.applyInitialBootstrap(snap2)).rejects.toThrow("Catalog is already bootstrapped for business: bus-A");

    const subsequentProducts = await db.catalog.listProducts(businessA);
    expect(subsequentProducts[0]!.name).toBe("Product 1"); // Original preserved
    expect(subsequentProducts).toEqual(originalProducts);
  });

  it("rolls back genuine Dexie transaction on constraint failure", async () => {
    const snap = createSnapshot(businessA);
    // Duplicate primary key explicitly inside the transaction to force Dexie bulkAdd failure
    // It passes JS validation but fails during write
    const badSnap = {
      ...snap,
      products: [
        ...snap.products,
        { ...snap.products[0] as any }
      ]
    };

    // Because bulkAdd throws when keys collide
    await expect(db.catalog.applyInitialBootstrap(badSnap)).rejects.toThrow();

    const products = await db.catalog.listProducts(businessA);
    expect(products).toHaveLength(0); // Atomicity ensures nothing is written

    const state = await db.catalog.getBootstrapState(businessA);
    expect(state).toBeNull();
  });

  it("preserves persistence across close and reopen", async () => {
    const snap = createSnapshot(businessA);
    (snap.barcodes[0]! as any).barcode = "000555";
    (snap.product_units[0]! as any).conversion_factor = "1.5000";
    await db.catalog.applyInitialBootstrap(snap);
    
    db.close();

    // Reopen same database
    const db2 = _createPosLocalDatabaseInternal({
      databaseName: db.name,
      dependencies: runtime.dependencies,
    });
    await db2.open();

    const state = await db2.catalog.getBootstrapState(businessA);
    expect(state).not.toBeNull();

    const barcodes = await db2.catalog.listBarcodes(businessA);
    expect(barcodes[0]!.barcode).toBe("000555"); // exact leading zero string

    const units = await db2.catalog.listProductUnits(businessA);
    expect(units[0]!.conversion_factor).toBe("1.5000"); // exact conversion factor string
    
    db2.close();
  });

  it("defines exact index and keyPath semantics natively", () => {
    // We can inspect the Dexie metadata
    // @ts-ignore
    const dexieDb = db._database;

    const productsStore = dexieDb.table("products").schema;
    expect(productsStore.primKey.keyPath).toBe("id");
    expect(productsStore.primKey.unique).toBe(true);
    expect(productsStore.indexes.map((i: any) => i.name)).toEqual(expect.arrayContaining([
      "business_id",
      "sku",
      "name",
      "status",
      "[business_id+sku]",
      "[business_id+status]"
    ]));
    expect(productsStore.indexes.find((i: any) => i.name === "[business_id+sku]")?.unique).toBe(true);

    const unitsStore = dexieDb.table("product_units").schema;
    expect(unitsStore.primKey.keyPath).toBe("id");
    expect(unitsStore.indexes.map((i: any) => i.name)).toEqual(expect.arrayContaining([
      "[product_id+unit_code]",
      "[business_id+product_id]",
      "[business_id+status]"
    ]));
    expect(unitsStore.indexes.find((i: any) => i.name === "[product_id+unit_code]")?.unique).toBe(true);

    const barcodesStore = dexieDb.table("barcodes").schema;
    expect(barcodesStore.primKey.keyPath).toBe("id");
    expect(barcodesStore.indexes.map((i: any) => i.name)).toEqual(expect.arrayContaining([
      "[business_id+barcode]",
      "[business_id+product_unit_id]",
      "[business_id+status]"
    ]));
    expect(barcodesStore.indexes.find((i: any) => i.name === "[business_id+barcode]")?.unique).toBe(false);

    const stateStore = dexieDb.table("catalog_bootstrap_state").schema;
    expect(stateStore.primKey.keyPath).toBe("business_id");
  });
});
