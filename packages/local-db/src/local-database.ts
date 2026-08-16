import Dexie, { type DexieOptions } from "dexie";

import {
  defineSchemaVersions,
  registerSchemaVersions,
  type LocalSchemaVersion,
} from "./schema-versions";

export type LocalDatabaseApplication = "backoffice" | "pos";

export interface LocalDatabaseLifecycle {
  readonly application: LocalDatabaseApplication;
  readonly name: string;
  readonly schemaVersion: number;
  close(): void;
  isOpen(): boolean;
  open(): Promise<void>;
}

export interface LocalDatabaseDefinition<
  TApplication extends LocalDatabaseApplication = LocalDatabaseApplication,
> {
  readonly application: TApplication;
  readonly currentSchemaVersion: number;
  readonly name: string;
  readonly schemaVersions: readonly LocalSchemaVersion[];
}

export interface LocalDatabaseRuntimeDependencies {
  readonly IDBKeyRange: NonNullable<DexieOptions["IDBKeyRange"]>;
  readonly indexedDB: NonNullable<DexieOptions["indexedDB"]>;
}

export interface CreateLocalDatabaseOptions {
  /** Internal test seam. Production factories never override the stable name. */
  readonly databaseName?: string;
  /** Internal test seam for an isolated IndexedDB implementation. */
  readonly dependencies?: LocalDatabaseRuntimeDependencies;
}

function assertDefinition(definition: LocalDatabaseDefinition): void {
  const latestVersion = definition.schemaVersions.at(-1)?.version;

  if (latestVersion !== definition.currentSchemaVersion) {
    throw new TypeError(
      `${definition.application} current schema version must match its latest declaration.`,
    );
  }
}

export class DexieLocalDatabase<
  TApplication extends LocalDatabaseApplication,
> implements LocalDatabaseLifecycle {
  readonly application: TApplication;
  readonly name: string;
  readonly schemaVersion: number;

  protected readonly _database: Dexie;

  constructor(
    definition: LocalDatabaseDefinition<TApplication>,
    options: CreateLocalDatabaseOptions,
  ) {
    assertDefinition(definition);

    this.application = definition.application;
    this.name = options.databaseName ?? definition.name;
    this.schemaVersion = definition.currentSchemaVersion;

    const dexieOptions: DexieOptions = options.dependencies
      ? {
          autoOpen: false,
          IDBKeyRange: options.dependencies.IDBKeyRange,
          indexedDB: options.dependencies.indexedDB,
        }
      : { autoOpen: false };

    this._database = new Dexie(this.name, dexieOptions);
    registerSchemaVersions(
      this._database,
      definition.schemaVersions,
      `${definition.application} local database`,
    );

    // A stale tab must release its connection so a newer schema can proceed.
    // autoOpen remains disabled, so no table operation can silently reopen it.
    this._database.on("versionchange", () => {
      this._database.close();
    });
  }

  async open(): Promise<void> {
    await this._database.open();
  }

  close(): void {
    this._database.close();
  }

  isOpen(): boolean {
    return this._database.isOpen();
  }
}

export function defineLocalDatabase<
  TApplication extends LocalDatabaseApplication,
>(
  definition: LocalDatabaseDefinition<TApplication>,
): Readonly<LocalDatabaseDefinition<TApplication>> {
  const normalizedDefinition: LocalDatabaseDefinition<TApplication> = {
    ...definition,
    schemaVersions: defineSchemaVersions(
      definition.schemaVersions,
      `${definition.application} local database definition`,
    ),
  };

  assertDefinition(normalizedDefinition);
  return Object.freeze(normalizedDefinition);
}

export function createLocalDatabase<
  TApplication extends LocalDatabaseApplication,
>(
  definition: LocalDatabaseDefinition<TApplication>,
  options: CreateLocalDatabaseOptions = {},
): LocalDatabaseLifecycle & { readonly application: TApplication } {
  return new DexieLocalDatabase(definition, options);
}
