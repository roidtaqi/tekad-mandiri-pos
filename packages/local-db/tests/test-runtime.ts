import Dexie from "dexie";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";

import type { LocalDatabaseRuntimeDependencies } from "../src/local-database";
import {
  defineSchemaVersions,
  registerSchemaVersions,
  type LocalSchemaVersion,
} from "../src/schema-versions";

interface Closable {
  close(): void;
}

let databaseSequence = 0;

export interface TestDatabaseRuntime {
  readonly dependencies: LocalDatabaseRuntimeDependencies;
  readonly indexedDB: IDBFactory;
  cleanup(): Promise<void>;
  createDatabase(
    label: string,
    schemaVersions: readonly LocalSchemaVersion[],
  ): Dexie;
  createDatabaseName(label: string): string;
  deleteDatabase(databaseName: string): Promise<void>;
  track<TConnection extends Closable>(connection: TConnection): TConnection;
}

export function createTestDatabaseRuntime(): TestDatabaseRuntime {
  const indexedDB = new IDBFactory();
  const dependencies: LocalDatabaseRuntimeDependencies = {
    IDBKeyRange,
    indexedDB,
  };
  const connections = new Set<Closable>();
  const databaseNames = new Set<string>();

  function createDatabaseName(label: string): string {
    databaseSequence += 1;
    const databaseName = `kastur-local-db-test-${label}-${databaseSequence}`;
    databaseNames.add(databaseName);
    return databaseName;
  }

  function track<TConnection extends Closable>(
    connection: TConnection,
  ): TConnection {
    connections.add(connection);
    return connection;
  }

  function createDatabase(
    label: string,
    schemaVersions: readonly LocalSchemaVersion[],
  ): Dexie {
    const database = track(
      new Dexie(createDatabaseName(label), {
        autoOpen: false,
        ...dependencies,
      }),
    );

    registerSchemaVersions(
      database,
      defineSchemaVersions(schemaVersions, `${label} test database`),
      `${label} test database`,
    );

    return database;
  }

  async function deleteDatabase(databaseName: string): Promise<void> {
    databaseNames.add(databaseName);
    const database = new Dexie(databaseName, {
      autoOpen: false,
      ...dependencies,
    });

    try {
      await database.delete();
    } finally {
      database.close();
    }
  }

  async function cleanup(): Promise<void> {
    for (const connection of connections) {
      connection.close();
    }

    for (const databaseName of databaseNames) {
      await deleteDatabase(databaseName);
    }
  }

  return {
    cleanup,
    createDatabase,
    createDatabaseName,
    deleteDatabase,
    dependencies,
    indexedDB,
    track,
  };
}
