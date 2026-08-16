import type Dexie from "dexie";
import type { Transaction } from "dexie";

export interface LocalSchemaVersion {
  readonly stores: Readonly<Record<string, string | null>>;
  readonly upgrade?: (
    transaction: Transaction,
  ) => PromiseLike<unknown> | void;
  readonly version: number;
}

function assertOrderedSchemaVersions(
  schemaVersions: readonly LocalSchemaVersion[],
  context: string,
): void {
  if (schemaVersions.length === 0) {
    throw new TypeError(`${context} must declare at least one schema version.`);
  }

  let previousVersion = 0;

  for (const schemaVersion of schemaVersions) {
    if (
      !Number.isSafeInteger(schemaVersion.version) ||
      schemaVersion.version <= 0
    ) {
      throw new TypeError(
        `${context} schema version ${String(schemaVersion.version)} must be a positive integer.`,
      );
    }

    if (schemaVersion.version <= previousVersion) {
      throw new TypeError(
        `${context} schema versions must be unique and registered in strictly increasing order.`,
      );
    }

    previousVersion = schemaVersion.version;
  }
}

/**
 * Validates and freezes an append-only schema history without opening IndexedDB.
 */
export function defineSchemaVersions(
  schemaVersions: readonly LocalSchemaVersion[],
  context: string,
): readonly LocalSchemaVersion[] {
  assertOrderedSchemaVersions(schemaVersions, context);

  return Object.freeze(
    schemaVersions.map((schemaVersion) =>
      Object.freeze({
        ...schemaVersion,
        stores: Object.freeze({ ...schemaVersion.stores }),
      }),
    ),
  );
}

/** Registers declarations in their audited source order. */
export function registerSchemaVersions(
  database: Dexie,
  schemaVersions: readonly LocalSchemaVersion[],
  context: string,
): void {
  assertOrderedSchemaVersions(schemaVersions, context);

  for (const schemaVersion of schemaVersions) {
    const version = database
      .version(schemaVersion.version)
      .stores({ ...schemaVersion.stores });

    if (schemaVersion.upgrade !== undefined) {
      version.upgrade(schemaVersion.upgrade);
    }
  }
}
