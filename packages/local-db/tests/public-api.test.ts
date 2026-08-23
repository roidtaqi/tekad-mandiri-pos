import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as LocalDatabase from "@kastur/local-db";
import {
  BACK_OFFICE_LOCAL_DATABASE_NAME,
  BACK_OFFICE_LOCAL_DATABASE_SCHEMA_VERSION,
  createBackOfficeLocalDatabase,
  createPosLocalDatabase,
  POS_LOCAL_DATABASE_NAME,
  POS_LOCAL_DATABASE_SCHEMA_VERSION,
} from "@kastur/local-db";

import { backOfficeLocalDatabaseDefinition } from "../src/back-office-database";
import { createLocalDatabase, defineLocalDatabase } from "../src/local-database";
import { posLocalDatabaseDefinition } from "../src/pos-database";
import { defineSchemaVersions } from "../src/schema-versions";
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from "./test-runtime";

let runtime: TestDatabaseRuntime;

beforeEach(() => {
  runtime = createTestDatabaseRuntime();
});

afterEach(async () => {
  await runtime.cleanup();
});

describe("public local database API", () => {
  it("exposes only the intentional runtime entry points", () => {
    expect(Object.keys(LocalDatabase).sort()).toEqual([
      "ACTIVE_SHIFT_ALREADY_EXISTS",
      "AMBIGUOUS_IDENTIFIER",
      "BACK_OFFICE_LOCAL_DATABASE_NAME",
      "BACK_OFFICE_LOCAL_DATABASE_SCHEMA_VERSION",
      "CASH_AUTHORIZATION_EXPIRED",
      "CASH_MOVEMENT_PERMISSION_DENIED",
      "CATALOG_ALREADY_BOOTSTRAPPED",
      "CashOperationError",
      "CompleteSaleError",
      "EMPTY_CART",
      "IDEMPOTENCY_KEY_REUSE_ERROR",
      "INVALID_AMOUNT",
      "INVALID_LOOKUP_INPUT",
      "INVALID_OPENING_CASH",
      "INVALID_SHIFT_CONTEXT",
      "INVALID_SHIFT_STATE",
      "LocalSyncStoreError",
      "NO_PUBLISHED_PRICE",
      "PAYMENT_INSUFFICIENT",
      "POS_LOCAL_DATABASE_NAME",
      "POS_LOCAL_DATABASE_SCHEMA_VERSION",
      "PRODUCT_NOT_FOUND",
      "PosCashManager",
      "PosSalesManager",
      "PricingBootstrapError",
      "ProductLookupError",
      "SALE_AUTHORIZATION_EXPIRED",
      "SALE_CART_INTEGRITY_INVALID",
      "SALE_NUMERIC_BOUNDARY_INVALID",
      "SALE_PERMISSION_DENIED",
      "SALE_SHIFT_CONTEXT_MISMATCH",
      "SALE_TERMINAL_REQUIRED",
      "SALE_UNIT_CONVERSION_INVALID",
      "SHIFT_ALREADY_CLOSING",
      "SHIFT_AUTHORIZATION_EXPIRED",
      "SHIFT_NOT_OPEN",
      "SHIFT_OPEN_PERMISSION_DENIED",
      "SHIFT_REQUIRED",
      "SYNC_CURSOR_MISMATCH",
      "SYNC_INVALID_INPUT",
      "SYNC_OUTBOX_LEASE_MISMATCH",
      "ShiftOpenError",
      "buildOpaqueProjectionKey",
      "createBackOfficeLocalDatabase",
      "createPosLocalDatabase",
    ]);

    expect(LocalDatabase).not.toHaveProperty("createLocalDatabase");
    expect(LocalDatabase).not.toHaveProperty("defineSchemaVersions");
    expect(LocalDatabase).not.toHaveProperty("posLocalDatabaseDefinition");
  });

  it("keeps stable, distinct POS and Back Office identities", () => {
    expect(POS_LOCAL_DATABASE_NAME).toBe("kastur-pos");
    expect(BACK_OFFICE_LOCAL_DATABASE_NAME).toBe("kastur-backoffice");
    expect(POS_LOCAL_DATABASE_NAME).not.toBe(
      BACK_OFFICE_LOCAL_DATABASE_NAME,
    );
    expect(POS_LOCAL_DATABASE_SCHEMA_VERSION).toBe(8);
    expect(BACK_OFFICE_LOCAL_DATABASE_SCHEMA_VERSION).toBe(1);

    const pos = createPosLocalDatabase();
    const backoffice = createBackOfficeLocalDatabase();

    expect(pos).toMatchObject({
      application: "pos",
      name: POS_LOCAL_DATABASE_NAME,
      schemaVersion: POS_LOCAL_DATABASE_SCHEMA_VERSION,
    });
    expect(backoffice).toMatchObject({
      application: "backoffice",
      name: BACK_OFFICE_LOCAL_DATABASE_NAME,
      schemaVersion: BACK_OFFICE_LOCAL_DATABASE_SCHEMA_VERSION,
    });
    expect(pos.isOpen()).toBe(false);
    expect(backoffice.isOpen()).toBe(false);

    pos.close();
    backoffice.close();
  });
});

describe("current production definitions", () => {
  it.each([
    ["POS", posLocalDatabaseDefinition],
    ["Back Office", backOfficeLocalDatabaseDefinition],
  ] as const)("creates a new %s database at its declared version", async (_, definition) => {
    const databaseName = runtime.createDatabaseName(definition.application);
    const database = runtime.track(
      createLocalDatabase(definition, {
        databaseName,
        dependencies: runtime.dependencies,
      }),
    );

    expect(database.isOpen()).toBe(false);
    await database.open();

    expect(database.isOpen()).toBe(true);
    expect(database.schemaVersion).toBe(definition.currentSchemaVersion);
    expect(definition.schemaVersions[0]?.stores).toEqual({});

    if (definition.application === "pos") {
      expect(definition.currentSchemaVersion).toBe(8);
      expect(definition.schemaVersions).toHaveLength(8);
      expect(definition.schemaVersions[6]?.version).toBe(7);
      expect(definition.schemaVersions[7]?.version).toBe(8);
      expect(Object.keys(definition.schemaVersions[3]?.stores ?? {}).sort()).toEqual([
        "shifts",
      ]);
      expect(Object.keys(definition.schemaVersions[4]?.stores ?? {}).sort()).toEqual([
        "outbox",
        "payments",
        "stock_movements",
        "transaction_items",
        "transactions",
      ]);
      expect(Object.keys(definition.schemaVersions[5]?.stores ?? {}).sort()).toEqual([
        "cash_movements",
        "shift_closing_snapshots",
      ]);
      expect(Object.keys(definition.schemaVersions[6]?.stores ?? {}).sort()).toEqual([
        "audit_events",
        "authorization_cache",
        "cash_movements",
        "outbox",
        "payment_methods",
        "promotions",
        "stock_balances",
        "sync_conflicts",
        "sync_observed_events",
        "sync_state",
        "transactions",
      ]);
      expect(Object.keys(definition.schemaVersions[7]?.stores ?? {})).toEqual([
        "published_retail_prices",
      ]);
    } else {
      expect(definition.currentSchemaVersion).toBe(1);
      expect(definition.schemaVersions).toHaveLength(1);
    }

    const databaseInfo = await runtime.indexedDB.databases();
    expect(databaseInfo.map(({ name }) => name)).toContain(databaseName);

    const request = runtime.indexedDB.open(databaseName);
    const objectStoreNames = await new Promise<string[]>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const nativeDatabase = request.result;
        const names = Array.from(nativeDatabase.objectStoreNames);
        nativeDatabase.close();
        resolve(names);
      };
    });

    if (definition.application === "pos") {
      expect(objectStoreNames.sort()).toEqual([
        "audit_events",
        "authorization_cache",
        "barcodes",
        "cash_movements",
        "catalog_bootstrap_state",
        "outbox",
        "payment_methods",
        "payments",
        "pricing_bootstrap_state",
        "product_units",
        "products",
        "promotions",
        "published_retail_prices",
        "shift_closing_snapshots",
        "shifts",
        "stock_balances",
        "stock_movements",
        "sync_conflicts",
        "sync_observed_events",
        "sync_state",
        "transaction_items",
        "transactions",
      ]);
    } else {
      expect(objectStoreNames).toEqual([]);
    }
  });

  it("advances POS from V1 to V2 preserving data isolation", async () => {
    const databaseName = runtime.createDatabaseName("v1-to-v2-upgrade");
    
    // Simulate opening V1 first
    const v1Versions = defineSchemaVersions([{ stores: {}, version: 1 }], "V1");
    const v1Definition = defineLocalDatabase({
      application: "pos",
      currentSchemaVersion: 1,
      name: databaseName,
      schemaVersions: v1Versions,
    });

    const dbV1 = runtime.track(
      createLocalDatabase(v1Definition, {
        databaseName,
        dependencies: runtime.dependencies,
      }),
    );
    await dbV1.open();
    dbV1.close();

    // Now open V2
    const dbV2 = runtime.track(
      createLocalDatabase(posLocalDatabaseDefinition, {
        databaseName,
        dependencies: runtime.dependencies,
      }),
    );
    await dbV2.open();
    expect(dbV2.schemaVersion).toBe(8);
    dbV2.close();
  });

  it("closes and reopens the same instance without changing its schema", async () => {
    const databaseName = runtime.createDatabaseName("reopen");
    const database = runtime.track(
      createLocalDatabase(posLocalDatabaseDefinition, {
        databaseName,
        dependencies: runtime.dependencies,
      }),
    );

    await database.open();
    const before = await runtime.indexedDB.databases();
    database.close();
    expect(database.isOpen()).toBe(false);

    await database.open();
    const after = await runtime.indexedDB.databases();

    expect(database.isOpen()).toBe(true);
    expect(database.schemaVersion).toBe(
      POS_LOCAL_DATABASE_SCHEMA_VERSION,
    );
    expect(after).toEqual(before);
  });

  it("creates independent POS and Back Office physical databases", async () => {
    const posName = runtime.createDatabaseName("pos-identity");
    const backOfficeName = runtime.createDatabaseName("backoffice-identity");
    const pos = runtime.track(
      createLocalDatabase(posLocalDatabaseDefinition, {
        databaseName: posName,
        dependencies: runtime.dependencies,
      }),
    );
    const backoffice = runtime.track(
      createLocalDatabase(backOfficeLocalDatabaseDefinition, {
        databaseName: backOfficeName,
        dependencies: runtime.dependencies,
      }),
    );

    await Promise.all([pos.open(), backoffice.open()]);

    expect(pos.application).toBe("pos");
    expect(backoffice.application).toBe("backoffice");
    expect(pos.name).not.toBe(backoffice.name);
    expect((await runtime.indexedDB.databases()).map(({ name }) => name).sort()).toEqual(
      [backOfficeName, posName].sort(),
    );
  });
});
