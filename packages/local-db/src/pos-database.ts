import {
  createLocalDatabase,
  defineLocalDatabase,
  type LocalDatabaseLifecycle,
} from "./local-database";
import { defineSchemaVersions } from "./schema-versions";

export const POS_LOCAL_DATABASE_NAME = "kastur-pos";
export const POS_LOCAL_DATABASE_SCHEMA_VERSION = 1;

const posSchemaVersions = defineSchemaVersions(
  [
    // Released V1 declarations are immutable. Append V2; never rewrite V1.
    { stores: {}, version: 1 },
  ],
  "pos local database",
);

export const posLocalDatabaseDefinition = defineLocalDatabase({
  application: "pos",
  currentSchemaVersion: POS_LOCAL_DATABASE_SCHEMA_VERSION,
  name: POS_LOCAL_DATABASE_NAME,
  schemaVersions: posSchemaVersions,
});

export interface PosLocalDatabase extends LocalDatabaseLifecycle {
  readonly application: "pos";
}

export function createPosLocalDatabase(): PosLocalDatabase {
  return createLocalDatabase(posLocalDatabaseDefinition);
}
