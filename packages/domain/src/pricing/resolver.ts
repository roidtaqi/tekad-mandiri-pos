import { type PosPublishedRetailPrice, PricingError } from "@kastur/contracts";
import {
  decimalCompare,
  decimalDivide,
  decimalMultiply,
  decimalSubtract,
  fitsPrecisionScale,
  moneyCompare,
  moneySubtract,
  parseDecimal,
  parseMoney,
  parseQuantity,
  quantizeDecimal,
  quantityCompare,
  type DecimalValue,
  type MoneyValue,
  type QuantityValue,
} from "@kastur/numeric";

const ZERO_MONEY = parseMoney("0");
const ZERO_QUANTITY = parseQuantity("0");
const ONE_HUNDRED = parseDecimal("100");

export type PricingTimeStatus = "TRUSTED" | "CLOCK_UNTRUSTED";

export interface PublishedPriceTier {
  readonly tier_id: string;
  readonly tier_code: string;
  readonly min_qty: string;
  readonly unit_price: string;
  readonly sort_order: number;
}

export type PublishedPromotionType =
  | "FIXED_PRICE"
  | "PERCENT_DISCOUNT"
  | "FIXED_DISCOUNT";

export interface PublishedPromotion {
  readonly promotion_id: string;
  readonly promotion_type: PublishedPromotionType;
  readonly value: string;
  readonly min_qty: string;
  readonly priority: number;
  readonly effective_from: string;
  readonly effective_to: string;
  readonly created_at: string;
}

export interface OfflinePriceResolutionInput {
  readonly product_unit_id: string;
  readonly price_version_id: string;
  readonly price_effective_from: string;
  readonly base_unit_price: string;
  readonly quantity: string;
  readonly price_tiers: readonly PublishedPriceTier[];
  readonly promotions: readonly PublishedPromotion[];
  readonly pricing_resolved_at: string;
  readonly pricing_time_status: PricingTimeStatus;
}

export interface AppliedTierSnapshot {
  readonly tier_id: string;
  readonly tier_code: string;
  readonly min_qty: QuantityValue;
  readonly unit_price: MoneyValue;
  readonly sort_order: number;
}

export interface AppliedPromotionSnapshot {
  readonly promotion_id: string;
  readonly promotion_type: PublishedPromotionType;
  readonly value: DecimalValue;
  readonly min_qty: QuantityValue;
  readonly priority: number;
  readonly effective_from: string;
  readonly effective_to: string;
  readonly created_at: string;
  readonly discount_per_unit: MoneyValue;
  readonly final_unit_price: MoneyValue;
}

export interface OfflinePriceResolution {
  readonly product_unit_id: string;
  readonly price_version_id: string;
  readonly price_effective_from: string;
  readonly pricing_resolved_at: string;
  readonly pricing_time_status: PricingTimeStatus;
  readonly quantity: QuantityValue;
  readonly base_unit_price: MoneyValue;
  readonly applied_tier: AppliedTierSnapshot | null;
  readonly tier_unit_price: MoneyValue;
  readonly applied_promotion: AppliedPromotionSnapshot | null;
  readonly promotion_discount: MoneyValue;
  readonly final_unit_price: MoneyValue;
  readonly warnings: readonly PricingResolutionWarning[];
}

export type PricingResolutionErrorCode =
  | "INVALID_BASE_PRICE"
  | "INVALID_PRICE_TIER"
  | "INVALID_PRICING_CONTEXT"
  | "INVALID_PRICING_QUANTITY"
  | "INVALID_PRICING_TIMESTAMP"
  | "INVALID_PROMOTION";

export type PricingResolutionWarning = "CLOCK_UNTRUSTED";

export class PricingResolutionError extends Error {
  constructor(
    public readonly code: PricingResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PricingResolutionError";
  }
}

export interface ResolvedPublishedRetailPrice {
  readonly price_version_id: string;
  readonly product_unit_id: string;
  readonly unit_price: MoneyValue;
  readonly effective_from: string;
  readonly effective_to: string | null;
}

export function resolvePublishedRetailPrice(
  cachedPrice: PosPublishedRetailPrice | null | undefined,
  productUnitId: string,
): ResolvedPublishedRetailPrice {
  if (!cachedPrice) {
    throw new PricingError(
      "PUBLISHED_RETAIL_PRICE_NOT_AVAILABLE",
      `Published retail price not available for product unit: ${productUnitId}`,
    );
  }

  if (cachedPrice.product_unit_id !== productUnitId) {
    throw new PricingError(
      "PUBLISHED_RETAIL_PRICE_NOT_AVAILABLE",
      `Product unit mismatch: ${productUnitId}`,
    );
  }

  return {
    price_version_id: cachedPrice.price_version_id,
    product_unit_id: cachedPrice.product_unit_id,
    unit_price: parseMoney(cachedPrice.unit_price),
    effective_from: cachedPrice.effective_from,
    effective_to: cachedPrice.effective_to,
  };
}

function timestamp(
  value: string,
  field: string,
  code: PricingResolutionErrorCode = "INVALID_PRICING_TIMESTAMP",
): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new PricingResolutionError(
      code,
      `${field} must be a valid timestamp.`,
    );
  }
  return parsed;
}

function requiredIdentifier(value: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PricingResolutionError(
      "INVALID_PRICING_CONTEXT",
      `${field} must be a non-empty string.`,
    );
  }
  return value.trim();
}

function positiveQuantity(value: string, code: PricingResolutionErrorCode): QuantityValue {
  let parsed: QuantityValue;
  try {
    parsed = parseQuantity(value);
  } catch {
    throw new PricingResolutionError(code, "Quantity must be a decimal string.");
  }
  if (
    quantityCompare(parsed, ZERO_QUANTITY) <= 0 ||
    !fitsPrecisionScale(parsed, 20, 6)
  ) {
    throw new PricingResolutionError(code, "Quantity must fit NUMERIC(20,6) and be positive.");
  }
  return parsed;
}

function nonNegativeMoney(value: string, code: PricingResolutionErrorCode): MoneyValue {
  let parsed: MoneyValue;
  try {
    parsed = parseMoney(value);
  } catch {
    throw new PricingResolutionError(code, "Money value must be a decimal string.");
  }
  if (moneyCompare(parsed, ZERO_MONEY) < 0 || !fitsPrecisionScale(parsed, 20, 4)) {
    throw new PricingResolutionError(
      code,
      "Money value must fit NUMERIC(20,4) and be non-negative.",
    );
  }
  return parsed;
}

function safeInteger(value: number, code: PricingResolutionErrorCode, field: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new PricingResolutionError(code, `${field} must be a safe integer.`);
  }
  return value;
}

function resolveTier(
  tiers: readonly PublishedPriceTier[],
  quantity: QuantityValue,
): AppliedTierSnapshot | null {
  const ids = new Set<string>();
  const codes = new Set<string>();
  const minimums = new Set<string>();
  const normalized = tiers.map((tier): AppliedTierSnapshot => {
    const id = tier.tier_id.trim();
    const code = tier.tier_code.trim();
    const minQty = positiveQuantity(tier.min_qty, "INVALID_PRICE_TIER");
    if (
      id === "" ||
      code === "" ||
      ids.has(id) ||
      codes.has(code) ||
      minimums.has(minQty)
    ) {
      throw new PricingResolutionError(
        "INVALID_PRICE_TIER",
        "Price tiers require unique non-empty IDs, codes, and minimum quantities.",
      );
    }
    ids.add(id);
    codes.add(code);
    minimums.add(minQty);
    return {
      tier_id: id,
      tier_code: code,
      min_qty: minQty,
      unit_price: nonNegativeMoney(tier.unit_price, "INVALID_PRICE_TIER"),
      sort_order: safeInteger(tier.sort_order, "INVALID_PRICE_TIER", "sort_order"),
    };
  });

  return normalized
    .filter((tier) => quantityCompare(tier.min_qty, quantity) <= 0)
    .sort((left, right) => quantityCompare(right.min_qty, left.min_qty))[0] ?? null;
}

function asMoney(value: DecimalValue, code: PricingResolutionErrorCode): MoneyValue {
  const rounded = quantizeDecimal(value, 4, "HALF_UP");
  if (!fitsPrecisionScale(rounded, 20, 4)) {
    throw new PricingResolutionError(code, "Resolved promotion money exceeds NUMERIC(20,4).");
  }
  return parseMoney(rounded);
}

interface PromotionCandidate extends AppliedPromotionSnapshot {
  readonly created_at_epoch: number;
}

function promotionCandidate(
  promotion: PublishedPromotion,
  tierUnitPrice: MoneyValue,
  quantity: QuantityValue,
  resolvedAt: number,
): PromotionCandidate | null {
  const id = promotion.promotion_id.trim();
  const minQty = positiveQuantity(promotion.min_qty, "INVALID_PROMOTION");
  const effectiveFrom = timestamp(
    promotion.effective_from,
    "promotion.effective_from",
    "INVALID_PROMOTION",
  );
  const effectiveTo = timestamp(
    promotion.effective_to,
    "promotion.effective_to",
    "INVALID_PROMOTION",
  );
  const createdAt = timestamp(
    promotion.created_at,
    "promotion.created_at",
    "INVALID_PROMOTION",
  );
  const priority = safeInteger(promotion.priority, "INVALID_PROMOTION", "priority");
  if (id === "" || effectiveTo <= effectiveFrom) {
    throw new PricingResolutionError(
      "INVALID_PROMOTION",
      "Promotion requires a non-empty ID and a valid effective interval.",
    );
  }
  if (
    quantityCompare(minQty, quantity) > 0 ||
    resolvedAt < effectiveFrom ||
    resolvedAt >= effectiveTo
  ) {
    return null;
  }

  let value: DecimalValue;
  try {
    value = parseDecimal(promotion.value);
  } catch {
    throw new PricingResolutionError("INVALID_PROMOTION", "Promotion value is invalid.");
  }
  if (
    decimalCompare(value, parseDecimal("0")) < 0 ||
    !fitsPrecisionScale(value, 20, 4)
  ) {
    throw new PricingResolutionError(
      "INVALID_PROMOTION",
      "Promotion value must fit NUMERIC(20,4) and be non-negative.",
    );
  }

  let finalUnitPrice: MoneyValue;
  switch (promotion.promotion_type) {
    case "FIXED_PRICE":
      finalUnitPrice = nonNegativeMoney(promotion.value, "INVALID_PROMOTION");
      break;
    case "FIXED_DISCOUNT": {
      const fixedDiscount = nonNegativeMoney(promotion.value, "INVALID_PROMOTION");
      if (moneyCompare(fixedDiscount, tierUnitPrice) > 0) {
        throw new PricingResolutionError(
          "INVALID_PROMOTION",
          "Fixed promotion discount cannot exceed the pre-promotion unit price.",
        );
      }
      finalUnitPrice = moneySubtract(tierUnitPrice, fixedDiscount);
      break;
    }
    case "PERCENT_DISCOUNT": {
      if (decimalCompare(value, ONE_HUNDRED) > 0) {
        throw new PricingResolutionError(
          "INVALID_PROMOTION",
          "Percentage promotion cannot exceed 100.",
        );
      }
      const remaining = decimalDivide(decimalSubtract(ONE_HUNDRED, value), ONE_HUNDRED);
      finalUnitPrice = asMoney(
        decimalMultiply(parseDecimal(tierUnitPrice), remaining),
        "INVALID_PROMOTION",
      );
      break;
    }
    default:
      throw new PricingResolutionError(
        "INVALID_PROMOTION",
        "Promotion type is not supported.",
      );
  }

  if (moneyCompare(finalUnitPrice, tierUnitPrice) >= 0) return null;
  return {
    promotion_id: id,
    promotion_type: promotion.promotion_type,
    value,
    min_qty: minQty,
    priority,
    effective_from: promotion.effective_from,
    effective_to: promotion.effective_to,
    created_at: promotion.created_at,
    created_at_epoch: createdAt,
    discount_per_unit: moneySubtract(tierUnitPrice, finalUnitPrice),
    final_unit_price: finalUnitPrice,
  };
}

function compareCanonicalIds(left: string, right: string): number {
  const canonicalLeft = left.toLowerCase();
  const canonicalRight = right.toLowerCase();
  return canonicalLeft < canonicalRight ? -1 : canonicalLeft > canonicalRight ? 1 : 0;
}

function comparePromotions(left: PromotionCandidate, right: PromotionCandidate): number {
  if (left.priority !== right.priority) {
    return left.priority > right.priority ? -1 : 1;
  }
  const benefit = moneyCompare(right.discount_per_unit, left.discount_per_unit);
  if (benefit !== 0) return benefit;
  if (left.created_at_epoch !== right.created_at_epoch) {
    return left.created_at_epoch - right.created_at_epoch;
  }
  return compareCanonicalIds(left.promotion_id, right.promotion_id);
}

function resolvePromotion(
  promotions: readonly PublishedPromotion[],
  tierUnitPrice: MoneyValue,
  quantity: QuantityValue,
  resolvedAt: number,
): AppliedPromotionSnapshot | null {
  const ids = new Set<string>();
  const candidates = promotions.flatMap((promotion) => {
    const canonicalId = promotion.promotion_id.trim().toLowerCase();
    if (canonicalId === "" || ids.has(canonicalId)) {
      throw new PricingResolutionError(
        "INVALID_PROMOTION",
        "Promotion IDs must be non-empty and unique.",
      );
    }
    ids.add(canonicalId);
    const candidate = promotionCandidate(promotion, tierUnitPrice, quantity, resolvedAt);
    return candidate === null ? [] : [candidate];
  });
  const selected = candidates.sort(comparePromotions)[0];
  if (selected === undefined) return null;
  const { created_at_epoch: _createdAtEpoch, ...snapshot } = selected;
  return snapshot;
}

export function resolveOfflineUnitPrice(
  input: OfflinePriceResolutionInput,
): OfflinePriceResolution {
  const productUnitId = requiredIdentifier(input.product_unit_id, "product_unit_id");
  const priceVersionId = requiredIdentifier(input.price_version_id, "price_version_id");
  timestamp(input.price_effective_from, "price_effective_from");
  if (
    input.pricing_time_status !== "TRUSTED" &&
    input.pricing_time_status !== "CLOCK_UNTRUSTED"
  ) {
    throw new PricingResolutionError(
      "INVALID_PRICING_CONTEXT",
      "pricing_time_status must be TRUSTED or CLOCK_UNTRUSTED.",
    );
  }
  if (!Array.isArray(input.price_tiers) || !Array.isArray(input.promotions)) {
    throw new PricingResolutionError(
      "INVALID_PRICING_CONTEXT",
      "Pricing tiers and promotions must be arrays.",
    );
  }
  const quantity = positiveQuantity(input.quantity, "INVALID_PRICING_QUANTITY");
  const baseUnitPrice = nonNegativeMoney(input.base_unit_price, "INVALID_BASE_PRICE");
  const resolvedAt = timestamp(input.pricing_resolved_at, "pricing_resolved_at");
  const appliedTier = resolveTier(input.price_tiers, quantity);
  const tierUnitPrice = appliedTier?.unit_price ?? baseUnitPrice;
  const clockTrusted = input.pricing_time_status === "TRUSTED";
  const appliedPromotion = clockTrusted
    ? resolvePromotion(input.promotions, tierUnitPrice, quantity, resolvedAt)
    : null;

  return {
    product_unit_id: productUnitId,
    price_version_id: priceVersionId,
    price_effective_from: input.price_effective_from,
    pricing_resolved_at: input.pricing_resolved_at,
    pricing_time_status: input.pricing_time_status,
    quantity,
    base_unit_price: baseUnitPrice,
    applied_tier: appliedTier,
    tier_unit_price: tierUnitPrice,
    applied_promotion: appliedPromotion,
    promotion_discount: appliedPromotion?.discount_per_unit ?? ZERO_MONEY,
    final_unit_price: appliedPromotion?.final_unit_price ?? tierUnitPrice,
    warnings: clockTrusted ? [] : ["CLOCK_UNTRUSTED"],
  };
}
