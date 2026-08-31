import type { Dexie } from "dexie";
import type { OfflineAuthorizationGrant } from "@kastur/contracts";

import type {
  LocalPosBarcode,
  LocalPosProduct,
  LocalPosProductUnit,
} from "./catalog-cache.js";

export const SYNC_CURSOR_MISMATCH = "SYNC_CURSOR_MISMATCH";
export const SYNC_OUTBOX_LEASE_MISMATCH = "SYNC_OUTBOX_LEASE_MISMATCH";
export const SYNC_INVALID_INPUT = "SYNC_INVALID_INPUT";

export class LocalSyncStoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "LocalSyncStoreError";
  }
}

export type LocalOutboxStatus =
  | "PENDING"
  | "SENDING"
  | "ACCEPTED"
  | "FAILED_RETRYABLE"
  | "REQUIRES_REVIEW";

export interface LocalOutboxRecord {
  readonly outbox_id: string;
  readonly command_id: string;
  readonly business_id: string;
  readonly business_event_id: string;
  readonly command_type: string;
  readonly schema_version: number;
  readonly location_id: string | null;
  readonly device_id: string;
  readonly authorization_version: number;
  readonly offline_authorization?: OfflineAuthorizationGrant;
  readonly correlation_id: string;
  readonly occurred_at: string;
  readonly payload: string;
  readonly request_fingerprint: string;
  readonly created_at: string;
  readonly attempt_count: number;
  readonly last_attempt_at: string | null;
  readonly status: LocalOutboxStatus;
  readonly last_error: string | null;
  readonly lease_owner?: string | null;
  readonly lease_expires_at?: string | null;
  readonly next_attempt_at?: string | null;
}

export interface LocalOutboxSummary {
  readonly pending: number;
  readonly sending: number;
  readonly failed_retryable: number;
  readonly requires_review: number;
  readonly unresolved: number;
}

export interface LocalSyncStateRecord {
  readonly context_key: string;
  readonly business_id: string;
  readonly device_id: string;
  readonly cursor: string;
  readonly bootstrap_version: number;
  readonly server_time: string;
  readonly clock_offset_ms: number;
  readonly clock_trust_status: "TRUSTED" | "CLOCK_UNTRUSTED";
  readonly updated_at: string;
}

export interface LocalSyncConflictRecord {
  readonly id: string;
  readonly business_id: string;
  readonly command_id: string | null;
  readonly conflict_type: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly local_value: unknown;
  readonly server_value: unknown;
  readonly status: "UNRESOLVED" | "RESOLVED";
  readonly created_at: string;
}

export interface LocalPublishedPriceTierRecord {
  readonly tier_id: string;
  readonly tier_code: string;
  readonly min_qty: string;
  readonly unit_price: string;
  readonly sort_order: number;
}

export interface LocalPublishedRetailPriceRecord {
  readonly price_version_id: string;
  readonly business_id: string;
  readonly product_unit_id: string;
  readonly unit_price: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly status: "ACTIVE" | "SCHEDULED";
  readonly tiers: readonly LocalPublishedPriceTierRecord[];
}

export type LocalOpaqueProjectionEntityType =
  | "promotion"
  | "payment_method"
  | "stock_balance"
  | "authorization";

export interface LocalOpaqueProjectionRecord {
  readonly key: string;
  readonly business_id: string;
  readonly entity_id: string;
  readonly entity_version: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly updated_at: string;
}

export interface LocalObservedSyncEventRecord {
  readonly sequence: string;
  readonly business_id: string;
  readonly entity_type: "sales_transaction" | "cash_shift" | "cash_movement";
  readonly entity_id: string;
  readonly occurred_at: string;
  readonly payload: unknown;
}

export type LocalSyncProjectionChange =
  | {
      readonly sequence: string;
      readonly entity_type: "product";
      readonly change_type: "UPSERT" | "DEACTIVATE";
      readonly value: LocalPosProduct;
    }
  | {
      readonly sequence: string;
      readonly entity_type: "product_unit";
      readonly change_type: "UPSERT" | "DEACTIVATE";
      readonly value: LocalPosProductUnit;
    }
  | {
      readonly sequence: string;
      readonly entity_type: "barcode";
      readonly change_type: "UPSERT" | "DEACTIVATE";
      readonly value: LocalPosBarcode;
    }
  | {
      readonly sequence: string;
      readonly entity_type: "published_retail_price";
      readonly change_type: "UPSERT" | "INVALIDATE";
      readonly value: LocalPublishedRetailPriceRecord;
    }
  | {
      readonly sequence: string;
      readonly entity_type: LocalOpaqueProjectionEntityType;
      readonly change_type: "UPSERT" | "DEACTIVATE" | "INVALIDATE";
      readonly value: LocalOpaqueProjectionRecord;
    };

export interface ClaimOutboxBatchInput {
  readonly business_id: string;
  readonly lease_owner: string;
  readonly claimed_at: string;
  readonly lease_expires_at: string;
  readonly limit?: number;
}

export interface SettleOutboxCommand {
  readonly command_id: string;
  readonly disposition:
    | "ACCEPTED"
    | "ACCEPTED_WITH_REVIEW"
    | "FAILED_RETRYABLE"
    | "REQUIRES_REVIEW";
  readonly error: string | null;
  readonly next_attempt_at?: string | null;
}

export interface ApplyProjectionPageInput {
  readonly business_id: string;
  readonly device_id: string;
  readonly expected_cursor: string;
  readonly next_cursor: string;
  readonly bootstrap_version: number;
  readonly server_time: string;
  readonly applied_at: string;
  readonly changes: readonly LocalSyncProjectionChange[];
  readonly observed_events?: readonly LocalObservedSyncEventRecord[];
}

export interface LocalBootstrapOpaqueProjection {
  readonly entity_type: LocalOpaqueProjectionEntityType;
  readonly value: LocalOpaqueProjectionRecord;
}

export interface ApplyBootstrapSnapshotInput {
  readonly business_id: string;
  readonly device_id: string;
  readonly bootstrap_version: 1;
  readonly cursor: string;
  readonly server_time: string;
  readonly applied_at: string;
  readonly products: readonly LocalPosProduct[];
  readonly product_units: readonly LocalPosProductUnit[];
  readonly barcodes: readonly LocalPosBarcode[];
  readonly published_retail_prices: readonly LocalPublishedRetailPriceRecord[];
  readonly opaque_projections: readonly LocalBootstrapOpaqueProjection[];
}

function assertLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new LocalSyncStoreError(
      "limit must be a positive safe integer.",
      SYNC_INVALID_INPUT,
    );
  }
}

function parseTimestamp(value: string, fieldName: string): number {
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    throw new LocalSyncStoreError(
      `${fieldName} must be a valid timestamp.`,
      SYNC_INVALID_INPUT,
    );
  }
  return parsed;
}

const CLOCK_TRUST_TOLERANCE_MS = 5 * 60 * 1_000;

function deriveClockMetadata(serverTime: string, appliedAt: string): {
  readonly clock_offset_ms: number;
  readonly clock_trust_status: "TRUSTED" | "CLOCK_UNTRUSTED";
} {
  const clockOffset = parseTimestamp(serverTime, "server_time") -
    parseTimestamp(appliedAt, "applied_at");
  return {
    clock_offset_ms: clockOffset,
    clock_trust_status:
      Math.abs(clockOffset) <= CLOCK_TRUST_TOLERANCE_MS
        ? "TRUSTED"
        : "CLOCK_UNTRUSTED",
  };
}

function parseCursor(value: string, fieldName: string): bigint {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new LocalSyncStoreError(
      `${fieldName} must be an unsigned decimal cursor string.`,
      SYNC_INVALID_INPUT,
    );
  }
  return BigInt(value);
}

function projectionStoreName(
  entityType: LocalOpaqueProjectionEntityType,
): "promotions" | "payment_methods" | "stock_balances" | "authorization_cache" {
  switch (entityType) {
    case "promotion":
      return "promotions";
    case "payment_method":
      return "payment_methods";
    case "stock_balance":
      return "stock_balances";
    case "authorization":
      return "authorization_cache";
  }
}

function assertUniqueKeys(
  values: readonly string[],
  description: string,
): void {
  if (new Set(values).size !== values.length) {
    throw new LocalSyncStoreError(
      `Bootstrap contains duplicate ${description}.`,
      SYNC_INVALID_INPUT,
    );
  }
}

export function buildSyncContextKey(
  businessId: string,
  deviceId: string,
): string {
  return JSON.stringify([businessId, deviceId]);
}

export function buildOpaqueProjectionKey(
  businessId: string,
  entityId: string,
): string {
  return JSON.stringify([businessId, entityId]);
}

/** Persistence port for sync orchestration without exposing the Dexie instance. */
export class PosSyncStore {
  constructor(private readonly db: Dexie) {}

  async getOutboxCommand(commandId: string): Promise<LocalOutboxRecord | null> {
    return (
      (await this.db
        .table<LocalOutboxRecord>("outbox")
        .where("command_id")
        .equals(commandId)
        .first()) ?? null
    );
  }

  async listPendingOutbox(
    businessId: string,
    limit = 50,
  ): Promise<readonly LocalOutboxRecord[]> {
    assertLimit(limit);

    return this.db
      .table<LocalOutboxRecord>("outbox")
      .where("[business_id+status]")
      .equals([businessId, "PENDING"])
      .sortBy("created_at")
      .then((records) => records.slice(0, limit));
  }

  async getOutboxSummary(businessId: string): Promise<LocalOutboxSummary> {
    const records = await this.db
      .table<LocalOutboxRecord>("outbox")
      .where("business_id")
      .equals(businessId)
      .toArray();

    const summary = {
      pending: 0,
      sending: 0,
      failed_retryable: 0,
      requires_review: 0,
    };
    for (const record of records) {
      switch (record.status) {
        case "PENDING":
          summary.pending += 1;
          break;
        case "SENDING":
          summary.sending += 1;
          break;
        case "FAILED_RETRYABLE":
          summary.failed_retryable += 1;
          break;
        case "REQUIRES_REVIEW":
          summary.requires_review += 1;
          break;
        case "ACCEPTED":
          break;
      }
    }

    return {
      ...summary,
      unresolved:
        summary.pending +
        summary.sending +
        summary.failed_retryable +
        summary.requires_review,
    };
  }

  /**
   * Re-opens only authority-related review rows for an explicit Owner-approved
   * recovery attempt. Domain/validation conflicts remain quarantined.
   */
  async authorizeRecoveryRetry(businessId: string): Promise<number> {
    const recoverableCodes = new Set([
      "SESSION_INVALID",
      "DEVICE_REVOKED",
      "MEMBERSHIP_INACTIVE",
      "PERMISSION_DENIED",
    ]);
    return this.db.transaction("rw", this.db.table("outbox"), async () => {
      const records = await this.db
        .table<LocalOutboxRecord>("outbox")
        .where("business_id")
        .equals(businessId)
        .filter((record) => {
          if (
            record.status !== "REQUIRES_REVIEW" ||
            record.offline_authorization === undefined ||
            record.last_error === null
          ) {
            return false;
          }
          try {
            const parsed = JSON.parse(record.last_error) as unknown;
            return (
              typeof parsed === "object" &&
              parsed !== null &&
              !Array.isArray(parsed) &&
              recoverableCodes.has(String((parsed as Record<string, unknown>).code))
            );
          } catch {
            return false;
          }
        })
        .toArray();
      for (const record of records) {
        await this.db.table<LocalOutboxRecord>("outbox").update(record.outbox_id, {
          last_error: null,
          lease_expires_at: null,
          lease_owner: null,
          next_attempt_at: null,
          status: "PENDING",
        });
      }
      return records.length;
    });
  }

  async claimOutboxBatch(
    input: ClaimOutboxBatchInput,
  ): Promise<readonly LocalOutboxRecord[]> {
    const limit = input.limit ?? 50;
    assertLimit(limit);
    const claimedAt = parseTimestamp(input.claimed_at, "claimed_at");
    const leaseExpiresAt = parseTimestamp(
      input.lease_expires_at,
      "lease_expires_at",
    );
    if (leaseExpiresAt <= claimedAt || input.lease_owner.length === 0) {
      throw new LocalSyncStoreError(
        "The outbox lease must have a non-empty owner and expire after claimed_at.",
        SYNC_INVALID_INPUT,
      );
    }

    return this.db.transaction("rw", this.db.table("outbox"), async () => {
      const candidates = await this.db
        .table<LocalOutboxRecord>("outbox")
        .where("business_id")
        .equals(input.business_id)
        .filter((record) => {
          if (record.status === "PENDING") return true;
          if (record.status === "FAILED_RETRYABLE") {
            return (
              record.next_attempt_at == null ||
              parseTimestamp(record.next_attempt_at, "next_attempt_at") <= claimedAt
            );
          }
          if (record.status === "SENDING") {
            return (
              record.lease_expires_at != null &&
              parseTimestamp(record.lease_expires_at, "lease_expires_at") <= claimedAt
            );
          }
          return false;
        })
        .toArray();

      const claimed = candidates
        .sort((left, right) => left.created_at.localeCompare(right.created_at))
        .slice(0, limit)
        .map(
          (record): LocalOutboxRecord => ({
            ...record,
            attempt_count: record.attempt_count + 1,
            last_attempt_at: input.claimed_at,
            lease_owner: input.lease_owner,
            lease_expires_at: input.lease_expires_at,
            status: "SENDING",
          }),
        );

      if (claimed.length > 0) {
        await this.db.table<LocalOutboxRecord>("outbox").bulkPut(claimed);
      }
      return claimed;
    });
  }

  async settleOutboxBatch(
    leaseOwner: string,
    settlements: readonly SettleOutboxCommand[],
  ): Promise<void> {
    const commandIds = new Set<string>();
    for (const settlement of settlements) {
      if (commandIds.has(settlement.command_id)) {
        throw new LocalSyncStoreError(
          `Duplicate settlement for ${settlement.command_id}.`,
          SYNC_INVALID_INPUT,
        );
      }
      commandIds.add(settlement.command_id);
      if (settlement.disposition === "FAILED_RETRYABLE") {
        if (settlement.next_attempt_at == null) {
          throw new LocalSyncStoreError(
            "FAILED_RETRYABLE requires next_attempt_at.",
            SYNC_INVALID_INPUT,
          );
        }
        parseTimestamp(settlement.next_attempt_at, "next_attempt_at");
      }
    }

    await this.db.transaction(
      "rw",
      [
        this.db.table("outbox"),
        this.db.table("transactions"),
        this.db.table("shifts"),
        this.db.table("audit_events"),
      ],
      async () => {
        for (const settlement of settlements) {
          const record = await this.db
            .table<LocalOutboxRecord>("outbox")
            .where("command_id")
            .equals(settlement.command_id)
            .first();
          if (
            record === undefined ||
            record.status !== "SENDING" ||
            record.lease_owner !== leaseOwner
          ) {
            throw new LocalSyncStoreError(
              `Outbox lease does not own ${settlement.command_id}.`,
              SYNC_OUTBOX_LEASE_MISMATCH,
            );
          }

          const accepted =
            settlement.disposition === "ACCEPTED" ||
            settlement.disposition === "ACCEPTED_WITH_REVIEW";
          const requiresReview =
            settlement.disposition === "ACCEPTED_WITH_REVIEW" ||
            settlement.disposition === "REQUIRES_REVIEW";
          const outboxStatus: LocalOutboxStatus = accepted
            ? "ACCEPTED"
            : requiresReview
              ? "REQUIRES_REVIEW"
              : "FAILED_RETRYABLE";

          await this.db.table("outbox").update(record.outbox_id, {
            last_error: settlement.error,
            lease_expires_at: null,
            lease_owner: null,
            next_attempt_at:
              settlement.disposition === "FAILED_RETRYABLE"
                ? settlement.next_attempt_at
                : null,
            status: outboxStatus,
          });

          if (settlement.disposition !== "FAILED_RETRYABLE") {
            const aggregateSyncStatus = requiresReview
              ? "REQUIRES_REVIEW"
              : "SYNCED";
            await this.db
              .table("transactions")
              .where("command_id")
              .equals(record.command_id)
              .modify({ sync_status: aggregateSyncStatus });
            await this.db
              .table("shifts")
              .where("shift_id")
              .equals(record.business_event_id)
              .modify({ sync_status: aggregateSyncStatus });
            await this.db
              .table("audit_events")
              .where("correlation_id")
              .equals(record.correlation_id)
              .modify({ sync_status: aggregateSyncStatus });
          }
        }
      },
    );
  }

  async getState(
    businessId: string,
    deviceId: string,
  ): Promise<LocalSyncStateRecord | null> {
    return (
      (await this.db
        .table<LocalSyncStateRecord>("sync_state")
        .get(buildSyncContextKey(businessId, deviceId))) ?? null
    );
  }

  async getOpaqueProjection(
    entityType: LocalOpaqueProjectionEntityType,
    businessId: string,
    entityId: string,
  ): Promise<LocalOpaqueProjectionRecord | null> {
    return (
      (await this.db
        .table<LocalOpaqueProjectionRecord>(projectionStoreName(entityType))
        .get(buildOpaqueProjectionKey(businessId, entityId))) ?? null
    );
  }

  async listObservedEvents(
    businessId: string,
    entityType: LocalObservedSyncEventRecord["entity_type"],
  ): Promise<readonly LocalObservedSyncEventRecord[]> {
    const events = await this.db
      .table<LocalObservedSyncEventRecord>("sync_observed_events")
      .where("[business_id+entity_type]")
      .equals([businessId, entityType])
      .toArray();
    return events.sort((left, right) => {
      const leftSequence = BigInt(left.sequence);
      const rightSequence = BigInt(right.sequence);
      return leftSequence < rightSequence
        ? -1
        : leftSequence > rightSequence
          ? 1
          : 0;
    });
  }

  async putState(state: LocalSyncStateRecord): Promise<void> {
    parseCursor(state.cursor, "cursor");
    parseTimestamp(state.server_time, "server_time");
    parseTimestamp(state.updated_at, "updated_at");
    if (!Number.isFinite(state.clock_offset_ms)) {
      throw new LocalSyncStoreError(
        "clock_offset_ms must be finite.",
        SYNC_INVALID_INPUT,
      );
    }
    const expectedKey = buildSyncContextKey(state.business_id, state.device_id);
    if (state.context_key !== expectedKey) {
      throw new LocalSyncStoreError(
        "sync_state context_key does not match its Business and Device.",
        SYNC_INVALID_INPUT,
      );
    }
    await this.db.table<LocalSyncStateRecord>("sync_state").put(state);
  }

  async applyBootstrapSnapshot(input: ApplyBootstrapSnapshotInput): Promise<void> {
    parseCursor(input.cursor, "cursor");
    parseTimestamp(input.server_time, "server_time");
    parseTimestamp(input.applied_at, "applied_at");
    const clock = deriveClockMetadata(input.server_time, input.applied_at);

    const productIds = input.products.map(({ id }) => id);
    const unitIds = input.product_units.map(({ id }) => id);
    const barcodeIds = input.barcodes.map(({ id }) => id);
    const priceIds = input.published_retail_prices.map(
      ({ price_version_id }) => price_version_id,
    );
    assertUniqueKeys(productIds, "product IDs");
    assertUniqueKeys(unitIds, "product-unit IDs");
    assertUniqueKeys(barcodeIds, "barcode IDs");
    assertUniqueKeys(priceIds, "price-version IDs");

    const productIdSet = new Set(productIds);
    const unitIdSet = new Set(unitIds);
    const barcodeIdSet = new Set(barcodeIds);
    const priceIdSet = new Set(priceIds);
    for (const product of input.products) {
      if (product.business_id !== input.business_id) {
        throw new LocalSyncStoreError(
          "Bootstrap product crosses Business scope.",
          SYNC_INVALID_INPUT,
        );
      }
    }
    for (const unit of input.product_units) {
      if (
        unit.business_id !== input.business_id ||
        !productIdSet.has(unit.product_id)
      ) {
        throw new LocalSyncStoreError(
          "Bootstrap product unit has invalid Business or product reference.",
          SYNC_INVALID_INPUT,
        );
      }
    }
    for (const barcode of input.barcodes) {
      if (
        barcode.business_id !== input.business_id ||
        !unitIdSet.has(barcode.product_unit_id)
      ) {
        throw new LocalSyncStoreError(
          "Bootstrap barcode has invalid Business or product-unit reference.",
          SYNC_INVALID_INPUT,
        );
      }
    }
    for (const price of input.published_retail_prices) {
      if (
        price.business_id !== input.business_id ||
        !unitIdSet.has(price.product_unit_id)
      ) {
        throw new LocalSyncStoreError(
          "Bootstrap price has invalid Business or product-unit reference.",
          SYNC_INVALID_INPUT,
        );
      }
    }
    for (const projection of input.opaque_projections) {
      if (
        projection.value.business_id !== input.business_id ||
        projection.value.key !==
          buildOpaqueProjectionKey(
            input.business_id,
            projection.value.entity_id,
          )
      ) {
        throw new LocalSyncStoreError(
          `Bootstrap ${projection.entity_type} projection is invalid.`,
          SYNC_INVALID_INPUT,
        );
      }
    }

    await this.db.transaction(
      "rw",
      [
        this.db.table("products"),
        this.db.table("product_units"),
        this.db.table("barcodes"),
        this.db.table("published_retail_prices"),
        this.db.table("catalog_bootstrap_state"),
        this.db.table("pricing_bootstrap_state"),
        this.db.table("promotions"),
        this.db.table("payment_methods"),
        this.db.table("stock_balances"),
        this.db.table("authorization_cache"),
        this.db.table("sync_state"),
      ],
      async () => {
        const existingProducts = await this.db
          .table<LocalPosProduct>("products")
          .where("business_id")
          .equals(input.business_id)
          .toArray();
        const existingUnits = await this.db
          .table<LocalPosProductUnit>("product_units")
          .where("business_id")
          .equals(input.business_id)
          .toArray();
        const existingBarcodes = await this.db
          .table<LocalPosBarcode>("barcodes")
          .where("business_id")
          .equals(input.business_id)
          .toArray();
        const existingPrices = await this.db
          .table<LocalPublishedRetailPriceRecord>("published_retail_prices")
          .where("business_id")
          .equals(input.business_id)
          .toArray();

        await this.db.table("barcodes").bulkDelete(
          existingBarcodes
            .filter(({ id }) => !barcodeIdSet.has(id))
            .map(({ id }) => id),
        );
        await this.db.table("published_retail_prices").bulkDelete(
          existingPrices
            .filter(({ price_version_id }) => !priceIdSet.has(price_version_id))
            .map(({ price_version_id }) => price_version_id),
        );
        await this.db.table("product_units").bulkDelete(
          existingUnits
            .filter(({ id }) => !unitIdSet.has(id))
            .map(({ id }) => id),
        );
        await this.db.table("products").bulkDelete(
          existingProducts
            .filter(({ id }) => !productIdSet.has(id))
            .map(({ id }) => id),
        );

        if (input.products.length > 0) {
          await this.db.table("products").bulkPut(input.products);
        }
        if (input.product_units.length > 0) {
          await this.db.table("product_units").bulkPut(input.product_units);
        }
        if (input.barcodes.length > 0) {
          await this.db.table("barcodes").bulkPut(input.barcodes);
        }
        if (input.published_retail_prices.length > 0) {
          await this.db
            .table("published_retail_prices")
            .bulkPut(input.published_retail_prices);
        }

        for (const entityType of [
          "promotion",
          "payment_method",
          "stock_balance",
          "authorization",
        ] as const) {
          const storeName = projectionStoreName(entityType);
          const incoming = input.opaque_projections
            .filter((projection) => projection.entity_type === entityType)
            .map(({ value }) => value);
          assertUniqueKeys(
            incoming.map(({ key }) => key),
            `${entityType} projection keys`,
          );
          const incomingKeys = new Set(incoming.map(({ key }) => key));
          const existing = await this.db
            .table<LocalOpaqueProjectionRecord>(storeName)
            .where("business_id")
            .equals(input.business_id)
            .toArray();
          await this.db.table(storeName).bulkDelete(
            existing
              .filter(({ key }) => !incomingKeys.has(key))
              .map(({ key }) => key),
          );
          if (incoming.length > 0) {
            await this.db.table(storeName).bulkPut(incoming);
          }
        }

        await this.db.table("catalog_bootstrap_state").put({
          business_id: input.business_id,
          bootstrap_version: input.bootstrap_version,
          server_time: input.server_time,
        });
        await this.db.table("pricing_bootstrap_state").put({
          business_id: input.business_id,
          bootstrap_version: input.bootstrap_version,
          server_time: input.server_time,
          applied_at: input.applied_at,
          ...clock,
        });
        await this.db.table<LocalSyncStateRecord>("sync_state").put({
          context_key: buildSyncContextKey(input.business_id, input.device_id),
          business_id: input.business_id,
          device_id: input.device_id,
          cursor: input.cursor,
          bootstrap_version: input.bootstrap_version,
          server_time: input.server_time,
          ...clock,
          updated_at: input.applied_at,
        });
      },
    );
  }

  async applyProjectionPage(input: ApplyProjectionPageInput): Promise<void> {
    const expectedCursor = parseCursor(input.expected_cursor, "expected_cursor");
    const nextCursor = parseCursor(input.next_cursor, "next_cursor");
    if (nextCursor < expectedCursor) {
      throw new LocalSyncStoreError(
        "next_cursor cannot move backwards.",
        SYNC_INVALID_INPUT,
      );
    }
    parseTimestamp(input.server_time, "server_time");
    parseTimestamp(input.applied_at, "applied_at");
    const clock = deriveClockMetadata(input.server_time, input.applied_at);
    const pageSequences = [
      ...input.changes.map(({ sequence }) => sequence),
      ...(input.observed_events ?? []).map(({ sequence }) => sequence),
    ];
    assertUniqueKeys(pageSequences, "change-feed sequences");

    await this.db.transaction(
      "rw",
      [
        this.db.table("products"),
        this.db.table("product_units"),
        this.db.table("barcodes"),
        this.db.table("published_retail_prices"),
        this.db.table("promotions"),
        this.db.table("payment_methods"),
        this.db.table("stock_balances"),
        this.db.table("authorization_cache"),
        this.db.table("sync_observed_events"),
        this.db.table("sync_state"),
      ],
      async () => {
        const contextKey = buildSyncContextKey(
          input.business_id,
          input.device_id,
        );
        const currentState = await this.db
          .table<LocalSyncStateRecord>("sync_state")
          .get(contextKey);
        const currentCursor = currentState?.cursor ?? "0";
        if (currentCursor !== input.expected_cursor) {
          throw new LocalSyncStoreError(
            `Expected cursor ${input.expected_cursor}, found ${currentCursor}.`,
            SYNC_CURSOR_MISMATCH,
          );
        }

        for (const change of input.changes) {
          const sequence = parseCursor(change.sequence, "change.sequence");
          if (sequence <= expectedCursor || sequence > nextCursor) {
            throw new LocalSyncStoreError(
              "Projection change sequence falls outside the cursor page.",
              SYNC_INVALID_INPUT,
            );
          }
          if (change.value.business_id !== input.business_id) {
            throw new LocalSyncStoreError(
              `${change.entity_type} change crosses Business scope.`,
              SYNC_INVALID_INPUT,
            );
          }
          switch (change.entity_type) {
            case "product":
              if (
                change.change_type === "DEACTIVATE" &&
                change.value.status !== "INACTIVE"
              ) {
                throw new LocalSyncStoreError(
                  "A deactivated product must carry INACTIVE status.",
                  SYNC_INVALID_INPUT,
                );
              }
              await this.db.table("products").put(change.value);
              break;
            case "product_unit":
              if (
                change.change_type === "DEACTIVATE" &&
                change.value.status !== "INACTIVE"
              ) {
                throw new LocalSyncStoreError(
                  "A deactivated product unit must carry INACTIVE status.",
                  SYNC_INVALID_INPUT,
                );
              }
              await this.db.table("product_units").put(change.value);
              break;
            case "barcode":
              if (
                change.change_type === "DEACTIVATE" &&
                change.value.status !== "INACTIVE"
              ) {
                throw new LocalSyncStoreError(
                  "A deactivated barcode must carry INACTIVE status.",
                  SYNC_INVALID_INPUT,
                );
              }
              await this.db.table("barcodes").put(change.value);
              break;
            case "published_retail_price":
              await this.db.table("published_retail_prices").put(change.value);
              break;
            case "promotion":
            case "payment_method":
            case "stock_balance":
            case "authorization":
              if (
                change.value.key !==
                buildOpaqueProjectionKey(
                  input.business_id,
                  change.value.entity_id,
                )
              ) {
                throw new LocalSyncStoreError(
                  `${change.entity_type} projection key is invalid.`,
                  SYNC_INVALID_INPUT,
                );
              }
              await this.db
                .table(projectionStoreName(change.entity_type))
                .put(change.value);
              break;
          }
        }

        for (const event of input.observed_events ?? []) {
          const sequence = parseCursor(event.sequence, "event.sequence");
          if (sequence <= expectedCursor || sequence > nextCursor) {
            throw new LocalSyncStoreError(
              "Observed event sequence falls outside the cursor page.",
              SYNC_INVALID_INPUT,
            );
          }
          if (event.business_id !== input.business_id) {
            throw new LocalSyncStoreError(
              "Observed event crosses Business scope.",
              SYNC_INVALID_INPUT,
            );
          }
          await this.db.table("sync_observed_events").put(event);
        }

        await this.db.table<LocalSyncStateRecord>("sync_state").put({
          context_key: contextKey,
          business_id: input.business_id,
          device_id: input.device_id,
          cursor: input.next_cursor,
          bootstrap_version: input.bootstrap_version,
          server_time: input.server_time,
          ...clock,
          updated_at: input.applied_at,
        });
      },
    );
  }

  async recordConflict(conflict: LocalSyncConflictRecord): Promise<void> {
    await this.db.table<LocalSyncConflictRecord>("sync_conflicts").add(conflict);
  }

  async listUnresolvedConflicts(
    businessId: string,
  ): Promise<readonly LocalSyncConflictRecord[]> {
    return this.db
      .table<LocalSyncConflictRecord>("sync_conflicts")
      .where("[business_id+status]")
      .equals([businessId, "UNRESOLVED"])
      .sortBy("created_at");
  }
}
