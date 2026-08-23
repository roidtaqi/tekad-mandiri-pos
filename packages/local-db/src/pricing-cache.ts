import type { PosPublishedRetailPriceBootstrapSnapshot } from "@kastur/contracts";
import type { Dexie } from "dexie";
import { PosCatalogCache } from "./catalog-cache.js";
import { parseMoney, parseQuantity } from "@kastur/numeric";
import type {
  LocalOpaqueProjectionRecord,
  LocalPublishedRetailPriceRecord,
  LocalSyncStateRecord,
} from "./sync-store.js";

export const PRICING_ALREADY_BOOTSTRAPPED = "PRICING_ALREADY_BOOTSTRAPPED";

export class PricingBootstrapError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "PricingBootstrapError";
  }
}

export interface LocalPricingTimeContext {
  readonly resolved_at: string;
  readonly status: "TRUSTED" | "CLOCK_UNTRUSTED";
}

export interface LocalApplicablePromotion {
  readonly promotion_id: string;
  readonly promotion_type: "FIXED_PRICE" | "PERCENT_DISCOUNT" | "FIXED_DISCOUNT";
  readonly value: string;
  readonly min_qty: string;
  readonly priority: number;
  readonly effective_from: string;
  readonly effective_to: string;
  readonly created_at: string;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function clockMetadata(serverTime: string, appliedAt: string) {
  const offset = new Date(serverTime).getTime() - new Date(appliedAt).getTime();
  return {
    applied_at: appliedAt,
    clock_offset_ms: offset,
    clock_trust_status:
      Math.abs(offset) <= 5 * 60 * 1_000 ? "TRUSTED" : "CLOCK_UNTRUSTED",
  } as const;
}

export class PosPricingCache {
  constructor(
    private readonly db: Dexie,
    private readonly catalog: PosCatalogCache
  ) {}

  async applyInitialBootstrap(snapshot: PosPublishedRetailPriceBootstrapSnapshot): Promise<void> {
    if (!snapshot || snapshot.bootstrap_version !== 1 || typeof snapshot.business_id !== "string" || !snapshot.business_id) {
      throw new PricingBootstrapError("Invalid bootstrap snapshot");
    }

    const { business_id, server_time, prices } = snapshot;
    if (!validTimestamp(server_time)) {
      throw new PricingBootstrapError("Invalid bootstrap server_time");
    }
    const appliedAt = new Date().toISOString();

    await this.db.transaction("rw", [this.db.table("pricing_bootstrap_state"), this.db.table("published_retail_prices"), this.db.table("product_units")], async () => {
      const existingState = await this.db.table("pricing_bootstrap_state").get(business_id);
      if (existingState) {
        throw new PricingBootstrapError("Pricing is already bootstrapped for this business.", PRICING_ALREADY_BOOTSTRAPPED);
      }

      const versionSet = new Set<string>();
      const unitSet = new Set<string>();

      const toInsert: any[] = [];
      for (const price of prices) {
        if (typeof price.price_version_id !== "string" || !price.price_version_id) {
          throw new PricingBootstrapError("Invalid price row: missing or invalid price_version_id");
        }
        if (typeof price.product_unit_id !== "string" || !price.product_unit_id) {
          throw new PricingBootstrapError("Invalid price row: missing or invalid product_unit_id");
        }
        if (typeof price.unit_price !== "string") {
          throw new PricingBootstrapError("Invalid price row: unit_price must be a string");
        }
        if (versionSet.has(price.price_version_id)) {
          throw new PricingBootstrapError(`Duplicate price_version_id in snapshot: ${price.price_version_id}`);
        }
        versionSet.add(price.price_version_id);

        if (unitSet.has(price.product_unit_id)) {
          throw new PricingBootstrapError(`Duplicate product_unit_id in snapshot: ${price.product_unit_id}`);
        }
        unitSet.add(price.product_unit_id);

        try {
          parseMoney(price.unit_price);
        } catch {
          throw new PricingBootstrapError(`Invalid unit_price for ${price.price_version_id}`);
        }

        if (typeof price.effective_from !== "string" || isNaN(new Date(price.effective_from).getTime())) {
          throw new PricingBootstrapError(`Invalid effective_from for ${price.price_version_id}`);
        }
        if (price.effective_to !== null && (typeof price.effective_to !== "string" || isNaN(new Date(price.effective_to).getTime()))) {
          throw new PricingBootstrapError(`Invalid effective_to for ${price.price_version_id}`);
        }
        if (price.effective_to !== null && new Date(price.effective_to).getTime() <= new Date(price.effective_from).getTime()) {
          throw new PricingBootstrapError(`effective_to must be after effective_from for ${price.price_version_id}`);
        }

        const pu = await this.db.table("product_units").get(price.product_unit_id);
        if (!pu || pu.business_id !== business_id) {
          throw new PricingBootstrapError(`Product unit ${price.product_unit_id} not found in catalog for business ${business_id}`);
        }

        toInsert.push({
          price_version_id: price.price_version_id,
          business_id,
          product_unit_id: price.product_unit_id,
          unit_price: price.unit_price,
          effective_from: price.effective_from,
          effective_to: price.effective_to,
          status: "ACTIVE",
          tiers: [{
            tier_id: `${price.price_version_id}:RETAIL`,
            tier_code: "RETAIL",
            min_qty: "1",
            unit_price: price.unit_price,
            sort_order: 0,
          }],
        });
      }

      if (toInsert.length > 0) {
        await this.db.table("published_retail_prices").bulkAdd(toInsert);
      }

      await this.db.table("pricing_bootstrap_state").add({
        business_id,
        bootstrap_version: snapshot.bootstrap_version,
        server_time,
        ...clockMetadata(server_time, appliedAt),
      });
    });
  }

  async getBootstrapState(businessId: string): Promise<any> {
    return await this.db.table("pricing_bootstrap_state").get(businessId);
  }

  async getPricingTimeContext(businessId: string): Promise<LocalPricingTimeContext> {
    const syncStates = await this.db
      .table<LocalSyncStateRecord>("sync_state")
      .where("business_id")
      .equals(businessId)
      .toArray();
    const state = syncStates.sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at),
    )[0];
    const legacyState = state === undefined
      ? await this.db.table("pricing_bootstrap_state").get(businessId)
      : undefined;
    const selected = state ?? legacyState;
    if (selected === undefined || !validTimestamp(selected.server_time)) {
      return {
        resolved_at: new Date().toISOString(),
        status: "CLOCK_UNTRUSTED",
      };
    }
    const trust = selected.clock_trust_status === "TRUSTED" ? "TRUSTED" : "CLOCK_UNTRUSTED";
    const offset = typeof selected.clock_offset_ms === "number" && Number.isFinite(selected.clock_offset_ms)
      ? selected.clock_offset_ms
      : 0;
    return {
      resolved_at:
        trust === "TRUSTED"
          ? new Date(Date.now() + offset).toISOString()
          : new Date(selected.server_time).toISOString(),
      status: trust,
    };
  }

  async getPublishedRetailPrice(
    businessId: string,
    productUnitId: string,
  ): Promise<LocalPublishedRetailPriceRecord | null> {
    const records = await this.db
      .table<LocalPublishedRetailPriceRecord>("published_retail_prices")
      .where("[business_id+product_unit_id]")
      .equals([businessId, productUnitId])
      .toArray();
    const time = await this.getPricingTimeContext(businessId);
    const asOf = new Date(time.resolved_at).getTime();
    return records
      .filter((record) => {
        const start = new Date(record.effective_from).getTime();
        const end = record.effective_to === null
          ? Number.POSITIVE_INFINITY
          : new Date(record.effective_to).getTime();
        return (
          (record.status === undefined || record.status === "ACTIVE" || record.status === "SCHEDULED") &&
          start <= asOf && asOf < end
        );
      })
      .sort((left, right) =>
        right.effective_from.localeCompare(left.effective_from) ||
        left.price_version_id.localeCompare(right.price_version_id),
      )[0] ?? null;
  }

  async listPublishedRetailPrices(
    businessId: string,
  ): Promise<LocalPublishedRetailPriceRecord[]> {
    return this.db
      .table<LocalPublishedRetailPriceRecord>("published_retail_prices")
      .where("business_id")
      .equals(businessId)
      .toArray();
  }

  async listApplicablePromotions(
    businessId: string,
    productUnitId: string,
  ): Promise<readonly LocalApplicablePromotion[]> {
    const time = await this.getPricingTimeContext(businessId);
    const asOf = new Date(time.resolved_at).getTime();
    const records = await this.db
      .table<LocalOpaqueProjectionRecord>("promotions")
      .where("business_id")
      .equals(businessId)
      .toArray();
    const promotions: LocalApplicablePromotion[] = [];
    for (const record of records) {
      const row = record.payload;
      if (row.product_unit_id !== productUnitId) continue;
      if (row.status !== "ACTIVE" && row.status !== "SCHEDULED") continue;
      if (
        typeof row.id !== "string" ||
        (row.promotion_type !== "FIXED_PRICE" &&
          row.promotion_type !== "PERCENT_DISCOUNT" &&
          row.promotion_type !== "FIXED_DISCOUNT") ||
        typeof row.value !== "string" ||
        typeof row.min_qty !== "string" ||
        typeof row.priority !== "number" ||
        !Number.isSafeInteger(row.priority) ||
        !validTimestamp(row.effective_from) ||
        !validTimestamp(row.effective_to) ||
        !validTimestamp(row.created_at)
      ) continue;
      const starts = new Date(row.effective_from).getTime();
      const ends = new Date(row.effective_to).getTime();
      if (starts > asOf || asOf >= ends) continue;
      try {
        parseMoney(row.value);
        parseQuantity(row.min_qty);
      } catch {
        continue;
      }
      promotions.push({
        promotion_id: row.id,
        promotion_type: row.promotion_type,
        value: row.value,
        min_qty: row.min_qty,
        priority: row.priority,
        effective_from: row.effective_from,
        effective_to: row.effective_to,
        created_at: row.created_at,
      });
    }
    return promotions;
  }
}
