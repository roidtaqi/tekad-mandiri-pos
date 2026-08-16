import {
  createLocalDatabase,
  defineLocalDatabase,
  DexieLocalDatabase,
  type CreateLocalDatabaseOptions,
  type LocalDatabaseLifecycle,
} from "./local-database";
import { defineSchemaVersions } from "./schema-versions";
import { PosCatalogCache } from "./catalog-cache";

export const POS_LOCAL_DATABASE_NAME = "kastur-pos";
export const POS_LOCAL_DATABASE_SCHEMA_VERSION = 2;

const posSchemaVersions = defineSchemaVersions(
  [
    // Released V1 declarations are immutable. Append V2; never rewrite V1.
    { stores: {}, version: 1 },
    {
      stores: {
        products:
          "&id, business_id, sku, name, status, &[business_id+sku], [business_id+status]",
        product_units:
          "&id, business_id, product_id, unit_code, status, &[product_id+unit_code], [business_id+product_id], [business_id+status]",
        barcodes:
          "&id, business_id, product_unit_id, barcode, status, [business_id+barcode], [business_id+product_unit_id], [business_id+status]",
        catalog_bootstrap_state: "&business_id, bootstrap_version, server_time",
      },
      version: 2,
    },
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
  readonly catalog: PosCatalogCache;
}

class PosLocalDatabaseImpl
  extends DexieLocalDatabase<"pos">
  implements PosLocalDatabase
{
  readonly catalog: PosCatalogCache;

  constructor(options: CreateLocalDatabaseOptions) {
    super(posLocalDatabaseDefinition, options);
    this.catalog = new PosCatalogCache(this._database);
  }
}

export function createPosLocalDatabase(
  options: CreateLocalDatabaseOptions = {},
): PosLocalDatabase {
  return new PosLocalDatabaseImpl(options);
}
