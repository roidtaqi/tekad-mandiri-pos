import type {
  SyncBootstrapResponse,
  SyncPullChange,
  SyncPullResponse,
} from "@kastur/contracts";
import { fitsPrecisionScale, parseQuantity } from "@kastur/numeric";
import {
  buildOpaqueProjectionKey,
  type LocalBootstrapOpaqueProjection,
  type LocalObservedSyncEventRecord,
  type LocalOpaqueProjectionEntityType,
  type LocalPosBarcode,
  type LocalPosProduct,
  type LocalPosProductUnit,
  type LocalPublishedRetailPriceRecord,
  type LocalSyncProjectionChange,
  type PosLocalDatabase,
} from "@kastur/local-db";
import {
  SyncProtocolError,
  type ClaimPushCandidatesInput,
  type LocalCommandResolution,
  type LocalSyncCommand,
  type LocalSyncStore,
  type SyncStoreContext,
} from "@kastur/sync-client";

import type { PosOperationalContext } from "./types.js";

export class ProjectionRequiresBootstrapError extends SyncProtocolError {
  constructor(message: string) {
    super(message);
    this.name = "ProjectionRequiresBootstrapError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new SyncProtocolError(`${field} harus berupa objek.`);
  return value;
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.trim() === "") {
    throw new SyncProtocolError(`${key} harus berupa string non-kosong.`);
  }
  return field;
}

function booleanField(value: Record<string, unknown>, key: string): boolean {
  const field = value[key];
  if (typeof field !== "boolean") throw new SyncProtocolError(`${key} harus berupa boolean.`);
  return field;
}

function integerField(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isSafeInteger(field)) {
    throw new SyncProtocolError(`${key} harus berupa integer aman.`);
  }
  return field;
}

function nullableStringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  if (field === null) return null;
  if (typeof field !== "string") throw new SyncProtocolError(`${key} harus string atau null.`);
  return field;
}

function timestampField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  if (Number.isNaN(new Date(field).getTime())) {
    throw new SyncProtocolError(`${key} harus berupa timestamp yang valid.`);
  }
  return field;
}

function stockQuantityField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  try {
    if (!fitsPrecisionScale(parseQuantity(field), 20, 6)) {
      throw new SyncProtocolError(`${key} melebihi NUMERIC(20,6).`);
    }
  } catch (error: unknown) {
    if (error instanceof SyncProtocolError) throw error;
    throw new SyncProtocolError(`${key} harus berupa string quantity desimal.`);
  }
  return field;
}

function enumField<T extends string>(
  value: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const field = stringField(value, key);
  if (!allowed.includes(field as T)) throw new SyncProtocolError(`${key} tidak dikenal.`);
  return field as T;
}

function optionalVersion(
  value: Record<string, unknown>,
  fallback: string | number | null,
): string | null {
  const candidate = value.version;
  if (typeof candidate === "string") return candidate;
  if (typeof candidate === "number") return String(candidate);
  return fallback === null ? null : String(fallback);
}

function parseProduct(value: unknown, businessId: string): LocalPosProduct {
  const row = record(value, "product");
  return {
    id: stringField(row, "id"),
    business_id: businessId,
    sku: stringField(row, "sku"),
    name: stringField(row, "name"),
    base_unit_code: stringField(row, "base_unit_code"),
    track_inventory: booleanField(row, "track_inventory"),
    status: enumField(row, "status", ["ACTIVE", "INACTIVE"] as const),
    version: stringField(row, "version"),
    updated_at: stringField(row, "updated_at"),
  };
}

function parseProductUnit(value: unknown, businessId: string): LocalPosProductUnit {
  const row = record(value, "product_unit");
  return {
    id: stringField(row, "id"),
    business_id: businessId,
    product_id: stringField(row, "product_id"),
    unit_code: stringField(row, "unit_code"),
    display_name: stringField(row, "display_name"),
    conversion_factor: stringField(row, "conversion_factor"),
    can_sell: booleanField(row, "can_sell"),
    can_purchase: booleanField(row, "can_purchase"),
    allow_decimal_qty: booleanField(row, "allow_decimal_qty"),
    status: enumField(row, "status", ["ACTIVE", "INACTIVE"] as const),
    version: stringField(row, "version"),
    updated_at: stringField(row, "updated_at"),
  };
}

function parseBarcode(value: unknown, businessId: string): LocalPosBarcode {
  const row = record(value, "barcode");
  return {
    id: stringField(row, "id"),
    business_id: businessId,
    product_unit_id: stringField(row, "product_unit_id"),
    barcode: stringField(row, "barcode"),
    is_internal: booleanField(row, "is_internal"),
    status: enumField(row, "status", ["ACTIVE", "INACTIVE"] as const),
    deactivated_at: nullableStringField(row, "deactivated_at"),
  };
}

function parsePriceTier(value: unknown, priceVersionId: string) {
  const row = record(value, "published_price_tier");
  if (stringField(row, "price_version_id") !== priceVersionId) {
    throw new SyncProtocolError("Tier harga tidak cocok dengan Price Version.");
  }
  return {
    tier_id: stringField(row, "id"),
    tier_code: stringField(row, "tier_code"),
    min_qty: stringField(row, "min_qty"),
    unit_price: stringField(row, "unit_price"),
    sort_order: integerField(row, "sort_order"),
  };
}

function parsePrice(
  value: unknown,
  businessId: string,
  separateTiers: readonly unknown[] = [],
): LocalPublishedRetailPriceRecord {
  const row = record(value, "published_retail_price");
  const priceVersionId = stringField(row, "price_version_id");
  const nestedTiers = Array.isArray(row.tiers) ? row.tiers : separateTiers;
  const tiers = nestedTiers.map((tier) => parsePriceTier(tier, priceVersionId));
  const unitPrice = stringField(row, "unit_price");
  if (tiers.length === 0) {
    tiers.push({
      tier_id: `${priceVersionId}:RETAIL`,
      tier_code: "RETAIL",
      min_qty: "1",
      unit_price: unitPrice,
      sort_order: 0,
    });
  }
  return {
    price_version_id: priceVersionId,
    business_id: businessId,
    product_unit_id: stringField(row, "product_unit_id"),
    unit_price: unitPrice,
    effective_from: stringField(row, "effective_from"),
    effective_to: nullableStringField(row, "effective_to"),
    status:
      row.status === undefined
        ? "ACTIVE"
        : enumField(row, "status", ["ACTIVE", "SCHEDULED"] as const),
    tiers,
  };
}

function opaqueProjection(
  entityType: LocalOpaqueProjectionEntityType,
  value: unknown,
  businessId: string,
  entityId: string,
  version: string | null,
  updatedAt: string,
): LocalBootstrapOpaqueProjection {
  const payload = record(value, entityType);
  return {
    entity_type: entityType,
    value: {
      key: buildOpaqueProjectionKey(businessId, entityId),
      business_id: businessId,
      entity_id: entityId,
      entity_version: optionalVersion(payload, version === null ? null : Number(version)),
      payload,
      updated_at: updatedAt,
    },
  };
}

function stockBalanceProjection(
  value: unknown,
  businessId: string,
  expectedProductId?: string,
  expectedLocationId?: string,
): LocalBootstrapOpaqueProjection {
  const row = record(value, "stock_balance");
  const payloadBusinessId = stringField(row, "business_id");
  const locationId = stringField(row, "location_id");
  const productId = stringField(row, "product_id");
  if (
    payloadBusinessId !== businessId ||
    (expectedProductId !== undefined && productId !== expectedProductId) ||
    (expectedLocationId !== undefined && locationId !== expectedLocationId)
  ) {
    throw new SyncProtocolError("Stock Balance melintasi konteks Business, lokasi, atau produk.");
  }
  const updatedAt = timestampField(row, "updated_at");
  return opaqueProjection(
    "stock_balance",
    {
      base_quantity: stockQuantityField(row, "base_quantity"),
      business_id: payloadBusinessId,
      last_movement_id: nullableStringField(row, "last_movement_id"),
      location_id: locationId,
      product_id: productId,
      updated_at: updatedAt,
    },
    businessId,
    productId,
    null,
    updatedAt,
  );
}

function bootstrapOpaqueRows(
  response: SyncBootstrapResponse,
  businessId: string,
): LocalBootstrapOpaqueProjection[] {
  const rows: LocalBootstrapOpaqueProjection[] = [];
  const append = (
    entityType: LocalOpaqueProjectionEntityType,
    values: readonly unknown[],
    idKey: string,
  ) => {
    for (const value of values) {
      const row = record(value, entityType);
      const entityId = stringField(row, idKey);
      rows.push(
        opaqueProjection(
          entityType,
          row,
          businessId,
          entityId,
          optionalVersion(row, null),
          typeof row.updated_at === "string" ? row.updated_at : response.server_time,
        ),
      );
    }
  };
  append("promotion", response.promotions, "id");
  append("payment_method", response.payment_methods, "id");
  const bootstrapLocationId = stringField(record(response.location, "location"), "id");
  for (const value of response.stock_balances) {
    rows.push(stockBalanceProjection(value, businessId, undefined, bootstrapLocationId));
  }
  rows.push(
    opaqueProjection(
      "authorization",
      response.authorization as unknown,
      businessId,
      response.authorization.user.id,
      String(response.authorization.authorization_version),
      response.server_time,
    ),
  );
  return rows;
}

export function parseOperationalContext(
  response: SyncBootstrapResponse,
): PosOperationalContext {
  const business = record(response.business, "business");
  const location = record(response.location, "location");
  const terminal = record(response.terminal, "terminal");
  const settings = record(response.settings, "settings");
  const businessId = stringField(business, "id");
  if (response.authorization.membership.business_id !== businessId) {
    throw new SyncProtocolError("Business bootstrap tidak cocok dengan konteks izin.");
  }
  if (response.authorization.default_location_id !== stringField(location, "id")) {
    throw new SyncProtocolError("Lokasi bootstrap tidak cocok dengan konteks izin.");
  }
  const receiptWidth = settings.receipt_width;
  if (receiptWidth !== "58mm" && receiptWidth !== "80mm") {
    throw new SyncProtocolError("Lebar struk bootstrap tidak didukung.");
  }
  return {
    auth: response.authorization,
    business: {
      id: businessId,
      name: stringField(business, "name"),
      currency_code: stringField(business, "currency_code"),
      timezone: stringField(business, "timezone"),
    },
    location: {
      id: stringField(location, "id"),
      code: stringField(location, "code"),
      name: stringField(location, "name"),
    },
    terminal: {
      id: stringField(terminal, "id"),
      code: stringField(terminal, "code"),
      name: stringField(terminal, "name"),
    },
    settings: {
      language: stringField(settings, "language"),
      receipt_width: receiptWidth,
    },
    payment_methods: response.payment_methods.map((value) => {
      const method = record(value, "payment_method");
      return {
        id: stringField(method, "id"),
        code: stringField(method, "code"),
        name: stringField(method, "name"),
        is_cash: booleanField(method, "is_cash"),
        offline_allowed: booleanField(method, "offline_allowed"),
      };
    }),
    source: "ONLINE",
  };
}

function projectionValue(
  change: SyncPullChange,
  businessId: string,
): LocalSyncProjectionChange {
  const payload = record(change.payload, `${change.entity_type} payload`);
  const withIdentity = {
    ...payload,
    id: typeof payload.id === "string" ? payload.id : change.entity_id,
    version: optionalVersion(payload, change.entity_version) ?? "1",
    updated_at:
      typeof payload.updated_at === "string" ? payload.updated_at : change.occurred_at,
  };
  switch (change.entity_type) {
    case "product":
      return {
        sequence: change.sequence,
        entity_type: "product",
        change_type: change.change_type as "UPSERT" | "DEACTIVATE",
        value: parseProduct(withIdentity, businessId),
      };
    case "product_unit":
      return {
        sequence: change.sequence,
        entity_type: "product_unit",
        change_type: change.change_type as "UPSERT" | "DEACTIVATE",
        value: parseProductUnit(withIdentity, businessId),
      };
    case "barcode":
      return {
        sequence: change.sequence,
        entity_type: "barcode",
        change_type: change.change_type as "UPSERT" | "DEACTIVATE",
        value: parseBarcode(withIdentity, businessId),
      };
    case "published_retail_price":
      return {
        sequence: change.sequence,
        entity_type: "published_retail_price",
        change_type: change.change_type as "UPSERT" | "INVALIDATE",
        value: parsePrice(payload, businessId),
      };
    case "stock_balance": {
      if (change.change_type !== "UPSERT") {
        throw new SyncProtocolError("Stock Balance incremental harus berupa UPSERT projection.");
      }
      const projection = stockBalanceProjection(
        payload,
        businessId,
        change.entity_id,
      ).value;
      return {
        sequence: change.sequence,
        entity_type: "stock_balance",
        change_type: "UPSERT",
        value: projection,
      };
    }
    case "promotion":
    case "payment_method":
    case "authorization": {
      const opaque = opaqueProjection(
        change.entity_type,
        payload,
        businessId,
        change.entity_id,
        change.entity_version === null ? null : String(change.entity_version),
        change.occurred_at,
      ).value;
      return {
        sequence: change.sequence,
        entity_type: change.entity_type,
        change_type: change.change_type as "UPSERT" | "DEACTIVATE" | "INVALIDATE",
        value: opaque,
      };
    }
    default:
      throw new SyncProtocolError(`Tipe projection ${change.entity_type} belum didukung POS.`);
  }
}

function observedEvent(
  change: SyncPullChange,
  businessId: string,
): LocalObservedSyncEventRecord {
  if (
    change.entity_type !== "sales_transaction" &&
    change.entity_type !== "cash_shift" &&
    change.entity_type !== "cash_movement"
  ) {
    throw new SyncProtocolError(`Tipe event ${change.entity_type} belum didukung POS.`);
  }
  return {
    sequence: change.sequence,
    business_id: businessId,
    entity_type: change.entity_type,
    entity_id: change.entity_id,
    occurred_at: change.occurred_at,
    payload: change.payload,
  };
}

export class PosLocalSyncStoreAdapter implements LocalSyncStore {
  readonly #leaseOwner: string;
  #latestBootstrap: PosOperationalContext | null = null;

  constructor(
    private readonly database: PosLocalDatabase,
    deviceId: string,
  ) {
    this.#leaseOwner = `pos-runtime:${deviceId}`;
  }

  getLatestBootstrapContext(): PosOperationalContext | null {
    return this.#latestBootstrap;
  }

  async claimPushCandidates(
    input: ClaimPushCandidatesInput,
  ): Promise<readonly LocalSyncCommand[]> {
    const records = await this.database.sync.claimOutboxBatch({
      business_id: input.business_id,
      lease_owner: this.#leaseOwner,
      claimed_at: input.claimed_at,
      lease_expires_at: input.lease_expires_at,
      limit: input.limit,
    });
    return records.map((entry) => ({
      business_id: entry.business_id,
      command_id: entry.command_id,
      command_type: entry.command_type,
      occurred_at: entry.occurred_at,
      ...(entry.location_id === null ? {} : { location_id: entry.location_id }),
      device_id: entry.device_id,
      authorization_version: entry.authorization_version,
      ...(entry.offline_authorization === undefined
        ? {}
        : { offline_authorization: entry.offline_authorization }),
      correlation_id: entry.correlation_id,
      payload: JSON.parse(entry.payload) as unknown,
      attempt_count: entry.attempt_count,
    }));
  }

  async resolveCommandAtomically(
    commandId: string,
    resolution: LocalCommandResolution,
  ): Promise<void> {
    const error =
      resolution.state === "ACCEPTED"
        ? null
        : resolution.state === "ACCEPTED_WITH_REVIEW"
          ? JSON.stringify({ warnings: resolution.warnings })
          : JSON.stringify({ code: resolution.error_code, message: resolution.message });
    await this.database.sync.settleOutboxBatch(this.#leaseOwner, [
      {
        command_id: commandId,
        disposition: resolution.state,
        error,
        ...(resolution.state === "FAILED_RETRYABLE"
          ? { next_attempt_at: resolution.next_attempt_at }
          : {}),
      },
    ]);
  }

  async getPullCursor(context: SyncStoreContext): Promise<string> {
    return (await this.database.sync.getState(context.business_id, context.device_id))?.cursor ?? "0";
  }

  async applyBootstrapAtomically(
    context: SyncStoreContext,
    response: SyncBootstrapResponse,
  ): Promise<void> {
    if (response.bootstrap_version !== 1) {
      throw new SyncProtocolError("Versi bootstrap POS belum didukung.");
    }
    const operational = parseOperationalContext(response);
    if (operational.business.id !== context.business_id) {
      throw new SyncProtocolError("Bootstrap melintasi Business aktif.");
    }
    await this.database.sync.applyBootstrapSnapshot({
      business_id: context.business_id,
      device_id: context.device_id,
      bootstrap_version: 1,
      cursor: response.sync_cursor,
      server_time: response.server_time,
      applied_at: new Date().toISOString(),
      products: response.products.map((value) => parseProduct(value, context.business_id)),
      product_units: response.product_units.map((value) =>
        parseProductUnit(value, context.business_id),
      ),
      barcodes: response.barcodes.map((value) => parseBarcode(value, context.business_id)),
      published_retail_prices: response.published_price_versions.map((value) =>
        parsePrice(
          value,
          context.business_id,
          response.published_price_tiers.filter((tier) => {
            const row = record(tier, "published_price_tier");
            const price = record(value, "published_retail_price");
            return row.price_version_id === price.price_version_id;
          }),
        ),
      ),
      opaque_projections: bootstrapOpaqueRows(response, context.business_id),
    });
    this.#latestBootstrap = operational;
  }

  async applyPullAtomically(
    context: SyncStoreContext,
    response: SyncPullResponse,
  ): Promise<void> {
    const projections: LocalSyncProjectionChange[] = [];
    const events: LocalObservedSyncEventRecord[] = [];
    try {
      for (const change of response.changes) {
        if (change.change_type === "EVENT") {
          events.push(observedEvent(change, context.business_id));
        } else {
          projections.push(projectionValue(change, context.business_id));
        }
      }
    } catch (error: unknown) {
      if (
        error instanceof SyncProtocolError &&
        response.changes.some((change) =>
          [
            "product",
            "product_unit",
            "barcode",
            "published_retail_price",
            "stock_movement",
            "customer_return",
          ].includes(change.entity_type),
        )
      ) {
        throw new ProjectionRequiresBootstrapError(
          "Projection incremental tidak lengkap; bootstrap atomik diperlukan.",
        );
      }
      throw error;
    }

    const state = await this.database.sync.getState(
      context.business_id,
      context.device_id,
    );
    await this.database.sync.applyProjectionPage({
      business_id: context.business_id,
      device_id: context.device_id,
      expected_cursor: state?.cursor ?? "0",
      next_cursor: response.next_cursor,
      bootstrap_version: state?.bootstrap_version ?? 1,
      server_time: response.server_time,
      applied_at: new Date().toISOString(),
      changes: projections,
      observed_events: events,
    });
  }
}
