import {
  defineLocalDatabase,
  DexieLocalDatabase,
  type CreateLocalDatabaseOptions,
  type LocalDatabaseLifecycle,
} from "./local-database";
import { defineSchemaVersions, type LocalSchemaVersion } from "./schema-versions";
import { PosCatalogCache } from "./catalog-cache.js";
import { PosPricingCache } from "./pricing-cache.js";
import { PosShiftCache } from "./shift-cache.js";
import { PosProductLookup } from "./product-lookup.js";
import { PosSalesManager } from "./sales-manager.js";
import { PosCashManager } from "./cash-manager.js";
import { PosAuditStore } from "./audit-store.js";
import { PosSyncStore } from "./sync-store.js";

export const POS_LOCAL_DATABASE_NAME = "kastur-pos";
export const POS_LOCAL_DATABASE_SCHEMA_VERSION = 8;

const posSchemaVersions: LocalSchemaVersion[] = [
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
  {
    stores: {
      published_retail_prices:
        "&price_version_id, business_id, product_unit_id, &[business_id+product_unit_id], effective_from",
      pricing_bootstrap_state: "&business_id, bootstrap_version, server_time",
    },
    version: 3,
  },
  {
    stores: {
      shifts:
        "&shift_id, &active_context_key, business_id, status, sync_status, opened_at",
    },
    version: 4,
  },
  {
    stores: {
      transactions:
        "&transaction_id, &command_id, &[business_id+transaction_number], business_id, shift_id, status, sync_status, occurred_at",
      transaction_items:
        "&transaction_item_id, transaction_id, product_id, product_unit_id",
      payments:
        "&payment_id, transaction_id, business_id, method_code, status, received_at",
      stock_movements:
        "&stock_movement_id, business_id, location_id, product_id, source_id, &[business_id+source_type+source_id+source_line_id+movement_type], occurred_at",
      outbox:
        "&outbox_id, &command_id, business_id, business_event_id, command_type, status, created_at",
    },
    version: 5,
    upgrade: (transaction) => {
      const shifts = transaction.table("shifts");
      const outbox = transaction.table("outbox");
      
      return shifts
        .where("sync_status")
        .equals("PENDING")
        .toArray()
        .then((pendingShifts) => {
          if (pendingShifts.length === 0) return;
          const outboxRecords = pendingShifts.map((shift) => ({
            outbox_id: crypto.randomUUID(),
            command_id: shift.shift_id,
            business_id: shift.business_id,
            business_event_id: shift.shift_id,
            command_type: "cash.shift.open",
            schema_version: 1,
            location_id: shift.location_id,
            device_id: shift.device_id,
            authorization_version: shift.authorization_version,
            correlation_id: shift.correlation_id || crypto.randomUUID(),
            occurred_at: shift.opened_at,
            payload: JSON.stringify({
              shift_id: shift.shift_id,
              shift_number: shift.shift_number,
              business_id: shift.business_id,
              location_id: shift.location_id,
              terminal_id: shift.terminal_id,
              cashier_user_id: shift.cashier_user_id,
              device_id: shift.device_id,
              opening_cash: shift.opening_cash,
              opened_at: shift.opened_at,
              authorization_version: shift.authorization_version,
            }),
            request_fingerprint: JSON.stringify({ backfill_shift: shift.shift_id }),
            created_at: new Date().toISOString(),
            attempt_count: 0,
            last_attempt_at: null,
            status: "PENDING",
            last_error: null,
          }));
          
          return outbox.bulkPut(outboxRecords);
        });
    },
  },
  {
    stores: {
      cash_movements:
        "&id, shift_id, movement_type, direction, source_type, source_id, occurred_at",
      shift_closing_snapshots:
        "&id, shift_id, created_at",
    },
    version: 6,
  },
  {
    stores: {
      transactions:
        "&transaction_id, &command_id, &[business_id+transaction_number], business_id, shift_id, status, sync_status, occurred_at, [business_id+occurred_at]",
      cash_movements:
        "&id, shift_id, business_id, movement_type, direction, source_type, source_id, &[business_id+source_type+source_id], occurred_at",
      outbox:
        "&outbox_id, &command_id, business_id, business_event_id, command_type, status, created_at, [business_id+status]",
      audit_events:
        "&id, business_id, location_id, actor_user_id, action, entity_type, entity_id, occurred_at, correlation_id, [business_id+entity_type+entity_id]",
      sync_state:
        "&context_key, business_id, device_id, &[business_id+device_id], updated_at",
      sync_conflicts:
        "&id, business_id, command_id, status, created_at, [business_id+status]",
      promotions: "&key, business_id, entity_id, updated_at",
      payment_methods: "&key, business_id, entity_id, updated_at",
      stock_balances: "&key, business_id, entity_id, updated_at",
      authorization_cache: "&key, business_id, entity_id, updated_at",
      sync_observed_events:
        "&sequence, business_id, entity_type, entity_id, occurred_at, [business_id+entity_type]",
    },
    version: 7,
  },
  {
    stores: {
      // Multiple immutable versions are cached so a trusted offline clock can
      // activate an already-published schedule without overwriting history.
      published_retail_prices:
        "&price_version_id, business_id, product_unit_id, [business_id+product_unit_id], effective_from",
    },
    version: 8,
  },
];

const posSchemaDeclarations = defineSchemaVersions(
  posSchemaVersions,
  "pos local database",
);

export const posLocalDatabaseDefinition = defineLocalDatabase({
  application: "pos",
  currentSchemaVersion: POS_LOCAL_DATABASE_SCHEMA_VERSION,
  name: POS_LOCAL_DATABASE_NAME,
  schemaVersions: posSchemaDeclarations,
});

export interface PosLocalDatabase extends LocalDatabaseLifecycle {
  readonly application: "pos";
  readonly catalog: PosCatalogCache;
  readonly pricing: PosPricingCache;
  readonly shifts: PosShiftCache;
  readonly cash: PosCashManager;
  readonly audit: PosAuditStore;
  readonly sync: PosSyncStore;
  readonly productLookup: PosProductLookup;
  readonly sales: PosSalesManager;
}

class PosLocalDatabaseImpl
  extends DexieLocalDatabase<"pos">
  implements PosLocalDatabase
{
  readonly catalog: PosCatalogCache;
  readonly pricing: PosPricingCache;
  readonly shifts: PosShiftCache;
  readonly cash: PosCashManager;
  readonly audit: PosAuditStore;
  readonly sync: PosSyncStore;
  readonly productLookup: PosProductLookup;
  readonly sales: PosSalesManager;

  constructor(options: CreateLocalDatabaseOptions) {
    super(posLocalDatabaseDefinition, options);
    this.catalog = new PosCatalogCache(this._database);
    this.pricing = new PosPricingCache(this._database, this.catalog);
    this.shifts = new PosShiftCache(this._database);
    this.cash = new PosCashManager(this._database, this.shifts);
    this.audit = new PosAuditStore(this._database);
    this.sync = new PosSyncStore(this._database);
    this.productLookup = new PosProductLookup(this._database, this.pricing);
    this.sales = new PosSalesManager(this._database);
  }
}

export function createPosLocalDatabase(): PosLocalDatabase {
  return new PosLocalDatabaseImpl({});
}

/** @internal Internal test seam */
export function _createPosLocalDatabaseInternal(
  options: CreateLocalDatabaseOptions = {},
): PosLocalDatabase {
  return new PosLocalDatabaseImpl(options);
}
