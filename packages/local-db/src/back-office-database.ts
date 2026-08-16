import {
  createLocalDatabase,
  defineLocalDatabase,
  type LocalDatabaseLifecycle,
} from "./local-database";
import { defineSchemaVersions } from "./schema-versions";

export const BACK_OFFICE_LOCAL_DATABASE_NAME = "kastur-backoffice";
export const BACK_OFFICE_LOCAL_DATABASE_SCHEMA_VERSION = 1;

const backOfficeSchemaVersions = defineSchemaVersions(
  [
    // Released V1 declarations are immutable. Append V2; never rewrite V1.
    { stores: {}, version: 1 },
  ],
  "backoffice local database",
);

export const backOfficeLocalDatabaseDefinition = defineLocalDatabase({
  application: "backoffice",
  currentSchemaVersion: BACK_OFFICE_LOCAL_DATABASE_SCHEMA_VERSION,
  name: BACK_OFFICE_LOCAL_DATABASE_NAME,
  schemaVersions: backOfficeSchemaVersions,
});

export interface BackOfficeLocalDatabase extends LocalDatabaseLifecycle {
  readonly application: "backoffice";
}

export function createBackOfficeLocalDatabase(): BackOfficeLocalDatabase {
  return createLocalDatabase(backOfficeLocalDatabaseDefinition);
}
