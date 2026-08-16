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
import { createLocalDatabase } from "../src/local-database";
import { posLocalDatabaseDefinition } from "../src/pos-database";
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
      "BACK_OFFICE_LOCAL_DATABASE_NAME",
      "BACK_OFFICE_LOCAL_DATABASE_SCHEMA_VERSION",
      "POS_LOCAL_DATABASE_NAME",
      "POS_LOCAL_DATABASE_SCHEMA_VERSION",
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
    expect(POS_LOCAL_DATABASE_SCHEMA_VERSION).toBe(1);
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
    expect(definition.schemaVersions).toHaveLength(1);
    expect(definition.schemaVersions[0]?.stores).toEqual({});

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

    expect(objectStoreNames).toEqual([]);
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
