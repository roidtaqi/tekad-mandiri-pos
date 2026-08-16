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

  async function expectBusinessCatalogEmpty(database: PosLocalDatabase, businessId: string) {
    const products = await database.catalog.listProducts(businessId);
    expect(products).toHaveLength(0);
    const units = await database.catalog.listProductUnits(businessId);
    expect(units).toHaveLength(0);
    const barcodes = await database.catalog.listBarcodes(businessId);
    expect(barcodes).toHaveLength(0);
    const state = await database.catalog.getBootstrapState(businessId);
    expect(state).toBeNull();
  }

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
    unsafeSnap.products[0]!.price = 2000;
    unsafeSnap.products[0]!.margin = 50;
    unsafeSnap.products[0]!.stock = 50;
    unsafeSnap.products[0]!.supplier = "Acme";

    await db.catalog.applyInitialBootstrap(unsafeSnap);

    const products = await db.catalog.listProducts(businessA);
    expect(products).toHaveLength(1);
    expect(products[0]).not.toHaveProperty("cost");
    expect(products[0]).not.toHaveProperty("price");
    expect(products[0]).not.toHaveProperty("margin");
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

  it("isolates multiple businesses safely with same SKU", async () => {
    const snapA = createSnapshot(businessA, {
      products: [
        {
          id: "p1",
          sku: "SKU-SAME",
          name: "Product 1 A",
          base_unit_code: "PCS",
          track_inventory: true,
          status: "ACTIVE",
          version: "v1",
          updated_at: "2026-08-17T00:00:00Z",
        },
      ],
    });
    const snapB = createSnapshot(businessB, {
      products: [
        {
          id: "p2",
          sku: "SKU-SAME",
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
          barcode: "00123", // same active barcode, different business
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
    expect(productsA[0]!.sku).toBe("SKU-SAME");
    expect(productsA[0]!.id).toBe("p1");

    const productsB = await db.catalog.listProducts(businessB);
    expect(productsB).toHaveLength(1);
    expect(productsB[0]!.sku).toBe("SKU-SAME");
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
    await expectBusinessCatalogEmpty(db, businessA);
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
    await expectBusinessCatalogEmpty(db, businessA);
  });

  it("exact same-business barcode text proof allows '00123' and '123' + INACTIVE '00123'", async () => {
    const snap = createSnapshot(businessA);
    const okSnap = {
      ...snap,
      barcodes: [
        { ...snap.barcodes[0], id: "b1", barcode: "00123", status: "ACTIVE" } as any,
        { ...snap.barcodes[0], id: "b2", barcode: "123", status: "ACTIVE" } as any,
        { ...snap.barcodes[0], id: "b3", barcode: "00123", status: "INACTIVE" } as any,
      ]
    };
    await expect(db.catalog.applyInitialBootstrap(okSnap)).resolves.not.toThrow();
    
    const barcodes = await db.catalog.listBarcodes(businessA);
    expect(barcodes).toHaveLength(3);
    const returnedTexts = barcodes.map(b => b.barcode);
    expect(returnedTexts).toContain("00123");
    expect(returnedTexts).toContain("123");
  });

  it("validates runtime status exactly", async () => {
    let snap = createSnapshot(businessA);
    (snap.products[0] as any).status = "DELETED";
    await expect(db.catalog.applyInitialBootstrap(snap)).rejects.toThrow("Invalid Product.status: DELETED");
    await expectBusinessCatalogEmpty(db, businessA);

    snap = createSnapshot(businessA);
    (snap.product_units[0] as any).status = "DRAFT";
    await expect(db.catalog.applyInitialBootstrap(snap)).rejects.toThrow("Invalid ProductUnit.status: DRAFT");
    await expectBusinessCatalogEmpty(db, businessA);

    snap = createSnapshot(businessA);
    (snap.barcodes[0] as any).status = "REVOKED";
    await expect(db.catalog.applyInitialBootstrap(snap)).rejects.toThrow("Invalid Barcode.status: REVOKED");
    await expectBusinessCatalogEmpty(db, businessA);
  });

  it("rejects non-string conversion_factor", async () => {
    const snap = createSnapshot(businessA);
    (snap.product_units[0] as any).conversion_factor = 1;
    await expect(db.catalog.applyInitialBootstrap(snap)).rejects.toThrow("ProductUnit.conversion_factor must be a string");
    await expectBusinessCatalogEmpty(db, businessA);
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
    const originalUnits = await db.catalog.listProductUnits(businessA);
    const originalBarcodes = await db.catalog.listBarcodes(businessA);
    const originalState = await db.catalog.getBootstrapState(businessA);
    
    const snap2 = createSnapshot(businessA);
    (snap2.products[0]! as any).name = "Mutated name";
    (snap2.product_units[0]! as any).conversion_factor = "9.9";
    (snap2.barcodes[0]! as any).barcode = "999";

    await expect(db.catalog.applyInitialBootstrap(snap2)).rejects.toThrow("Catalog is already bootstrapped for business: bus-A");

    expect(await db.catalog.listProducts(businessA)).toEqual(originalProducts);
    expect(await db.catalog.listProductUnits(businessA)).toEqual(originalUnits);
    expect(await db.catalog.listBarcodes(businessA)).toEqual(originalBarcodes);
    expect(await db.catalog.getBootstrapState(businessA)).toEqual(originalState);
  });

  it("rolls back genuine Dexie transaction on constraint failure", async () => {
    const snap = createSnapshot(businessA);
    // Use distinct IDs to pass structure check, but identical SKU for same business to fail Dexie index
    const badSnap = {
      ...snap,
      products: [
        { ...snap.products[0], id: "p1", sku: "SKU-DUP" } as any,
        { ...snap.products[0], id: "p2", sku: "SKU-DUP" } as any,
      ]
    };

    // Because bulkAdd throws when keys collide
    await expect(db.catalog.applyInitialBootstrap(badSnap)).rejects.toThrow();

    await expectBusinessCatalogEmpty(db, businessA);
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

    const products = await db2.catalog.listProducts(businessA);
    expect(products[0]!.id).toBe("p1");
    expect(products[0]!.sku).toBe("SKU-1");

    const barcodes = await db2.catalog.listBarcodes(businessA);
    expect(barcodes[0]!.barcode).toBe("000555"); // exact leading zero string

    const units = await db2.catalog.listProductUnits(businessA);
    expect(units[0]!.conversion_factor).toBe("1.5000"); // exact conversion factor string
    
    db2.close();
  });

  it("defines exact index and keyPath semantics natively", async () => {
    const req = runtime.indexedDB.open(db.name);
    const idb = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const txn = idb.transaction(["products", "product_units", "barcodes", "catalog_bootstrap_state"], "readonly");
    
    const productsStore = txn.objectStore("products");
    expect(productsStore.keyPath).toBe("id");
    expect(Array.from(productsStore.indexNames)).toEqual(expect.arrayContaining([
      "business_id", "sku", "name", "status", "[business_id+sku]", "[business_id+status]"
    ]));
    expect(productsStore.index("[business_id+sku]").unique).toBe(true);

    const unitsStore = txn.objectStore("product_units");
    expect(unitsStore.keyPath).toBe("id");
    expect(Array.from(unitsStore.indexNames)).toEqual(expect.arrayContaining([
      "[product_id+unit_code]", "[business_id+product_id]", "[business_id+status]"
    ]));
    expect(unitsStore.index("[product_id+unit_code]").unique).toBe(true);

    const barcodesStore = txn.objectStore("barcodes");
    expect(barcodesStore.keyPath).toBe("id");
    expect(Array.from(barcodesStore.indexNames)).toEqual(expect.arrayContaining([
      "[business_id+barcode]", "[business_id+product_unit_id]", "[business_id+status]"
    ]));
    expect(barcodesStore.index("[business_id+barcode]").unique).toBe(false);

    const stateStore = txn.objectStore("catalog_bootstrap_state");
    expect(stateStore.keyPath).toBe("business_id");

    idb.close();
  });
});
