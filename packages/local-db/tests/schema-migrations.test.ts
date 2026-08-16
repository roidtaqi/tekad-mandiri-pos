import Dexie, { type Transaction } from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createLocalDatabase,
  defineLocalDatabase,
} from "../src/local-database";
import {
  defineSchemaVersions,
  registerSchemaVersions,
  type LocalSchemaVersion,
} from "../src/schema-versions";
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from "./test-runtime";

interface NeutralRecord {
  id?: number;
  normalizedValue?: string;
  partiallyMigrated?: boolean;
  value: string;
}

const neutralVersionOne: LocalSchemaVersion = {
  stores: { records: "++id,value" },
  version: 1,
};

let runtime: TestDatabaseRuntime;

beforeEach(() => {
  runtime = createTestDatabaseRuntime();
});

afterEach(async () => {
  await runtime.cleanup();
});

describe("schema version registry", () => {
  it("preserves deterministic declaration and registration order", () => {
    const declarations = defineSchemaVersions(
      [
        neutralVersionOne,
        {
          stores: { records: "++id,value,normalizedValue" },
          version: 2,
        },
        {
          stores: {
            records: "++id,value,normalizedValue,partiallyMigrated",
          },
          version: 3,
        },
      ],
      "ordered fixture",
    );
    const database = runtime.track(
      new Dexie(runtime.createDatabaseName("ordered"), {
        autoOpen: false,
        ...runtime.dependencies,
      }),
    );
    const registration = vi.spyOn(database, "version");
    registerSchemaVersions(database, declarations, "ordered fixture");

    expect(declarations.map(({ version }) => version)).toEqual([1, 2, 3]);
    expect(registration.mock.calls.map(([version]) => version)).toEqual([
      1, 2, 3,
    ]);
    expect(Object.isFrozen(declarations)).toBe(true);
    expect(Object.isFrozen(declarations[0])).toBe(true);
    expect(Object.isFrozen(declarations[0]?.stores)).toBe(true);
  });

  it.each([
    ["empty", []],
    [
      "duplicate",
      [neutralVersionOne, { stores: {}, version: 1 }],
    ],
    [
      "descending",
      [{ stores: {}, version: 2 }, neutralVersionOne],
    ],
    ["zero", [{ stores: {}, version: 0 }]],
    ["fractional", [{ stores: {}, version: 1.5 }]],
  ] as const)("rejects an %s schema history", (_, declarations) => {
    expect(() =>
      defineSchemaVersions(declarations, "invalid fixture"),
    ).toThrow(TypeError);
  });

  it("rejects a definition whose current version differs from its history", () => {
    expect(() =>
      defineLocalDatabase({
        application: "pos",
        currentSchemaVersion: 2,
        name: "invalid-definition",
        schemaVersions: defineSchemaVersions(
          [neutralVersionOne],
          "invalid definition fixture",
        ),
      }),
    ).toThrow(/current schema version must match its latest declaration/u);
  });
});

describe("migration behavior", () => {
  it("does not run upgrade callbacks when creating a fresh latest database", async () => {
    const upgrade = vi.fn((_transaction: Transaction) => undefined);
    const database = runtime.createDatabase("fresh-latest", [
      neutralVersionOne,
      {
        stores: { records: "++id,value,normalizedValue" },
        upgrade,
        version: 2,
      },
    ]);

    await database.open();

    expect(database.verno).toBe(2);
    expect(upgrade).not.toHaveBeenCalled();
  });

  it("executes multiple pending upgrades in ascending version order", async () => {
    const databaseName = runtime.createDatabaseName("ordered-upgrades");
    const versionOne = runtime.track(
      new Dexie(databaseName, {
        autoOpen: false,
        ...runtime.dependencies,
      }),
    );
    registerSchemaVersions(
      versionOne,
      defineSchemaVersions([neutralVersionOne], "ordered upgrades V1"),
      "ordered upgrades V1",
    );
    await versionOne.open();
    versionOne.close();

    const executionOrder: string[] = [];
    const latest = runtime.track(
      new Dexie(databaseName, {
        autoOpen: false,
        ...runtime.dependencies,
      }),
    );
    registerSchemaVersions(
      latest,
      defineSchemaVersions(
        [
          neutralVersionOne,
          {
            stores: { records: "++id,value,normalizedValue" },
            upgrade: (_transaction: Transaction) => {
              executionOrder.push("V2");
            },
            version: 2,
          },
          {
            stores: {
              records: "++id,value,normalizedValue,partiallyMigrated",
            },
            upgrade: (_transaction: Transaction) => {
              executionOrder.push("V3");
            },
            version: 3,
          },
        ],
        "ordered upgrades latest",
      ),
      "ordered upgrades latest",
    );

    await latest.open();

    expect(latest.verno).toBe(3);
    expect(executionOrder).toEqual(["V2", "V3"]);
  });

  it("runs an upgrade only when advancing and preserves transformed data", async () => {
    const databaseName = runtime.createDatabaseName("successful-upgrade");
    const versionOne = runtime.track(
      new Dexie(databaseName, {
        autoOpen: false,
        ...runtime.dependencies,
      }),
    );
    registerSchemaVersions(
      versionOne,
      defineSchemaVersions([neutralVersionOne], "successful upgrade V1"),
      "successful upgrade V1",
    );
    await versionOne.open();
    await versionOne.table<NeutralRecord, number>("records").add({
      value: "  Example Value  ",
    });
    versionOne.close();

    const upgrade = vi.fn(async (transaction: Transaction) => {
      await transaction
        .table<NeutralRecord, number>("records")
        .toCollection()
        .modify((record) => {
          record.normalizedValue = record.value.trim().toLocaleLowerCase("en");
        });
    });
    const latestVersions = defineSchemaVersions(
      [
        neutralVersionOne,
        {
          stores: { records: "++id,value,normalizedValue" },
          upgrade,
          version: 2,
        },
      ],
      "successful upgrade latest",
    );
    const latest = runtime.track(
      new Dexie(databaseName, {
        autoOpen: false,
        ...runtime.dependencies,
      }),
    );
    registerSchemaVersions(latest, latestVersions, "successful upgrade latest");
    await latest.open();

    expect(upgrade).toHaveBeenCalledTimes(1);
    expect(await latest.table<NeutralRecord>("records").toArray()).toEqual([
      {
        id: 1,
        normalizedValue: "example value",
        value: "  Example Value  ",
      },
    ]);
    latest.close();

    const reopenedLatest = runtime.track(
      new Dexie(databaseName, {
        autoOpen: false,
        ...runtime.dependencies,
      }),
    );
    registerSchemaVersions(
      reopenedLatest,
      latestVersions,
      "successful upgrade reopened latest",
    );
    await reopenedLatest.open();

    expect(upgrade).toHaveBeenCalledTimes(1);
    expect(await reopenedLatest.table<NeutralRecord>("records").count()).toBe(1);
  });

  it("rolls back both schema and data when an upgrade throws", async () => {
    const versionOne = runtime.createDatabase("failed-upgrade-seed", [
      neutralVersionOne,
    ]);
    const seededDatabaseName = versionOne.name;
    await versionOne.open();
    await versionOne.table<NeutralRecord, number>("records").add({
      value: "Original",
    });
    versionOne.close();

    const failingDatabase = runtime.track(
      new Dexie(seededDatabaseName, {
        autoOpen: false,
        ...runtime.dependencies,
      }),
    );
    const failingVersions = defineSchemaVersions(
      [
        neutralVersionOne,
        {
          stores: {
            records: "++id,value,normalizedValue,partiallyMigrated",
          },
          upgrade: async (transaction) => {
            await transaction
              .table<NeutralRecord, number>("records")
              .toCollection()
              .modify((record) => {
                record.normalizedValue = "partial";
                record.partiallyMigrated = true;
              });
            throw new Error("intentional migration failure");
          },
          version: 2,
        },
      ],
      "failing upgrade",
    );
    registerSchemaVersions(
      failingDatabase,
      failingVersions,
      "failing upgrade",
    );

    await expect(failingDatabase.open()).rejects.toThrow(
      "intentional migration failure",
    );
    failingDatabase.close();

    const reopenedVersionOne = runtime.track(
      new Dexie(seededDatabaseName, {
        autoOpen: false,
        ...runtime.dependencies,
      }),
    );
    registerSchemaVersions(
      reopenedVersionOne,
      defineSchemaVersions([neutralVersionOne], "rollback check V1"),
      "rollback check V1",
    );
    await reopenedVersionOne.open();

    expect(reopenedVersionOne.verno).toBe(1);
    expect(
      reopenedVersionOne
        .table<NeutralRecord>("records")
        .schema.indexes.map(({ name }) => name),
    ).toEqual(["value"]);
    expect(await reopenedVersionOne.table<NeutralRecord>("records").toArray()).toEqual([
      { id: 1, value: "Original" },
    ]);
  });

  it("keeps data isolated between POS and Back Office fixture identities", async () => {
    const pos = runtime.createDatabase("pos-data-isolation", [neutralVersionOne]);
    const backoffice = runtime.createDatabase("backoffice-data-isolation", [
      neutralVersionOne,
    ]);
    await Promise.all([pos.open(), backoffice.open()]);

    await pos.table<NeutralRecord, number>("records").add({ value: "POS only" });

    expect(await pos.table<NeutralRecord>("records").count()).toBe(1);
    expect(await backoffice.table<NeutralRecord>("records").count()).toBe(0);

    await backoffice
      .table<NeutralRecord, number>("records")
      .add({ value: "Back Office only" });

    expect(await pos.table<NeutralRecord>("records").toArray()).toEqual([
      { id: 1, value: "POS only" },
    ]);
    expect(await backoffice.table<NeutralRecord>("records").toArray()).toEqual([
      { id: 1, value: "Back Office only" },
    ]);
  });

  it("closes an older live connection so a newer schema can open", async () => {
    const databaseName = runtime.createDatabaseName("versionchange");
    const versionOne = defineSchemaVersions(
      [neutralVersionOne],
      "versionchange V1",
    );
    const oldConnection = runtime.track(
      createLocalDatabase(
        defineLocalDatabase({
          application: "pos",
          currentSchemaVersion: 1,
          name: databaseName,
          schemaVersions: versionOne,
        }),
        {
          databaseName,
          dependencies: runtime.dependencies,
        },
      ),
    );
    await oldConnection.open();

    const actualNewerConnection = runtime.track(
      new Dexie(databaseName, {
        autoOpen: false,
        ...runtime.dependencies,
      }),
    );
    registerSchemaVersions(
      actualNewerConnection,
      defineSchemaVersions(
        [
          neutralVersionOne,
          {
            stores: { records: "++id,value,normalizedValue" },
            version: 2,
          },
        ],
        "versionchange V2",
      ),
      "versionchange V2",
    );

    await actualNewerConnection.open();

    expect(actualNewerConnection.isOpen()).toBe(true);
    expect(actualNewerConnection.verno).toBe(2);
    expect(oldConnection.isOpen()).toBe(false);
  });

  it("deletes a test database cleanly and permits reuse of its name", async () => {
    const database = runtime.createDatabase("cleanup", [neutralVersionOne]);
    const databaseName = database.name;
    await database.open();
    database.close();

    expect((await runtime.indexedDB.databases()).map(({ name }) => name)).toContain(
      databaseName,
    );
    await runtime.deleteDatabase(databaseName);
    expect((await runtime.indexedDB.databases()).map(({ name }) => name)).not.toContain(
      databaseName,
    );

    const reused = runtime.track(
      new Dexie(databaseName, {
        autoOpen: false,
        ...runtime.dependencies,
      }),
    );
    registerSchemaVersions(
      reused,
      defineSchemaVersions([neutralVersionOne], "reused cleanup fixture"),
      "reused cleanup fixture",
    );
    await reused.open();

    expect(reused.isOpen()).toBe(true);
    expect(await reused.table<NeutralRecord>("records").count()).toBe(0);
  });
});
