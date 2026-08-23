import {
  fitsPrecisionScale,
  moneyAdd,
  multiplyMoneyByQuantity,
  parseMoney,
  parseQuantity,
  quantityAdd,
  quantityCompare,
  type DecimalValue,
  type MoneyValue,
  type QuantityValue,
} from "@kastur/numeric";
import {
  PricingResolutionError,
  resolveOfflineUnitPrice,
  type OfflinePriceResolution,
  type PricingResolutionWarning,
  type PricingTimeStatus,
  type PublishedPriceTier,
  type PublishedPromotion,
  type PublishedPromotionType,
} from "../pricing/resolver.js";
import {
  CART_BUSINESS_MISMATCH,
  CART_PRICE_CONTEXT_CONFLICT,
  DECIMAL_QUANTITY_NOT_ALLOWED,
  INVALID_CART_PRICE,
  INVALID_CART_QUANTITY,
  CartError,
} from "./cart-errors.js";

export interface CartPricingContext {
  readonly product_unit_id: string;
  readonly price_version_id: string;
  readonly price_effective_from: string;
  readonly base_unit_price: MoneyValue;
  readonly price_tiers: readonly PublishedPriceTier[];
  readonly promotions: readonly PublishedPromotion[];
  readonly pricing_resolved_at: string;
  readonly pricing_time_status: PricingTimeStatus;
}

export interface CartLine {
  readonly line_key: string;
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly product_name: string;
  readonly unit_code: string;
  readonly variant_name: string;
  readonly sku: string;
  readonly barcode: string | null;

  readonly allow_decimal_qty: boolean;
  readonly price_version_id: string;
  readonly price_effective_from: string;

  readonly quantity: QuantityValue;
  /** Final unit price after the applicable tier and at most one promotion. */
  readonly unit_price: MoneyValue;
  readonly line_total: MoneyValue;

  readonly base_unit_price: MoneyValue;
  readonly tier_id: string | null;
  readonly tier_code: string | null;
  readonly tier_min_qty: QuantityValue | null;
  readonly tier_unit_price: MoneyValue;
  readonly promotion_id: string | null;
  readonly promotion_type: PublishedPromotionType | null;
  readonly promotion_value: DecimalValue | null;
  /** Promotion benefit per unit; aggregate values multiply this by quantity. */
  readonly promotion_discount: MoneyValue;
  readonly pricing_resolved_at: string;
  readonly pricing_time_status: PricingTimeStatus;
  readonly pricing_warnings: readonly PricingResolutionWarning[];
  /** Immutable candidate snapshot used for deterministic quantity re-resolution. */
  readonly pricing_context: CartPricingContext;

  readonly conversion_factor: string;
  readonly track_inventory: boolean;
}

export interface CartTotals {
  /** Sum after quantity tiers, before promotions. */
  readonly gross_subtotal: MoneyValue;
  readonly promotion_discount_total: MoneyValue;
  readonly grand_total: MoneyValue;
}

export interface Cart {
  readonly business_id: string;
  readonly lines: readonly CartLine[];
}

export interface LookupResultBoundary {
  readonly business_id: string;
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly product_name: string;
  readonly variant_name: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly unit_price: string;
  readonly price_effective_from: string;
  readonly unit_code: string;
  readonly allow_decimal_qty: boolean;
  readonly price_version_id: string;
  readonly conversion_factor: string;
  readonly track_inventory: boolean;
  readonly price_tiers: readonly PublishedPriceTier[];
  readonly promotions: readonly PublishedPromotion[];
  readonly pricing_resolved_at: string;
  readonly pricing_time_status: PricingTimeStatus;
}

export function createCart(businessId: string): Cart {
  return {
    business_id: businessId,
    lines: [],
  };
}

export function calculateCartTotals(cart: Cart): CartTotals {
  let grossSubtotal = parseMoney("0");
  let promotionDiscountTotal = parseMoney("0");
  let grandTotal = parseMoney("0");
  for (const line of cart.lines) {
    grossSubtotal = moneyAdd(
      grossSubtotal,
      multiplyMoneyByQuantity(line.tier_unit_price, line.quantity),
    );
    promotionDiscountTotal = moneyAdd(
      promotionDiscountTotal,
      multiplyMoneyByQuantity(line.promotion_discount, line.quantity),
    );
    grandTotal = moneyAdd(grandTotal, line.line_total);
  }
  return {
    gross_subtotal: grossSubtotal,
    promotion_discount_total: promotionDiscountTotal,
    grand_total: grandTotal,
  };
}

function generateLineKey(productUnitId: string, priceVersionId: string): string {
  return JSON.stringify([productUnitId, priceVersionId]);
}

function assertQuantityPrecision(quantity: QuantityValue): void {
  if (!fitsPrecisionScale(quantity, 20, 6)) {
    throw new CartError("Invalid cart quantity precision", INVALID_CART_QUANTITY);
  }
}

function validateQuantity(quantity: string, allowDecimal: boolean): QuantityValue {
  let canonicalQuantity: QuantityValue;
  try {
    canonicalQuantity = parseQuantity(quantity);
  } catch {
    throw new CartError("Invalid cart quantity format", INVALID_CART_QUANTITY);
  }

  assertQuantityPrecision(canonicalQuantity);

  if (quantityCompare(canonicalQuantity, parseQuantity("0")) <= 0) {
    throw new CartError("Quantity must be greater than zero", INVALID_CART_QUANTITY);
  }

  if (!allowDecimal && canonicalQuantity.includes(".")) {
    const [whole, fractional] = canonicalQuantity.split(".");
    if (fractional !== undefined && /[^0]/u.test(fractional)) {
      throw new CartError("Decimal quantity not allowed", DECIMAL_QUANTITY_NOT_ALLOWED);
    }
    canonicalQuantity = parseQuantity(whole!);
  }

  return canonicalQuantity;
}

function validatePrice(price: string): MoneyValue {
  let canonicalPrice: MoneyValue;
  try {
    canonicalPrice = parseMoney(price);
  } catch {
    throw new CartError("Invalid cart price format", INVALID_CART_PRICE);
  }

  if (canonicalPrice.startsWith("-") || !fitsPrecisionScale(canonicalPrice, 20, 4)) {
    throw new CartError("Invalid cart price boundary", INVALID_CART_PRICE);
  }

  return canonicalPrice;
}

function resolvePrice(
  context: CartPricingContext,
  quantity: QuantityValue,
): OfflinePriceResolution {
  try {
    return resolveOfflineUnitPrice({
      ...context,
      quantity,
    });
  } catch (error) {
    if (error instanceof PricingResolutionError) {
      throw new CartError(
        `Invalid cart pricing context: ${error.message}`,
        INVALID_CART_PRICE,
      );
    }
    throw error;
  }
}

function clonePricingContext(item: LookupResultBoundary): CartPricingContext {
  return {
    product_unit_id: item.product_unit_id,
    price_version_id: item.price_version_id,
    price_effective_from: item.price_effective_from,
    base_unit_price: validatePrice(item.unit_price),
    price_tiers: item.price_tiers.map((tier) => ({ ...tier })),
    promotions: item.promotions.map((promotion) => ({ ...promotion })),
    pricing_resolved_at: item.pricing_resolved_at,
    pricing_time_status: item.pricing_time_status,
  };
}

function withResolvedPrice(
  line: Omit<
    CartLine,
    | "base_unit_price"
    | "line_total"
    | "pricing_resolved_at"
    | "pricing_time_status"
    | "pricing_warnings"
    | "promotion_discount"
    | "promotion_id"
    | "promotion_type"
    | "promotion_value"
    | "quantity"
    | "tier_code"
    | "tier_id"
    | "tier_min_qty"
    | "tier_unit_price"
    | "unit_price"
  >,
  quantity: QuantityValue,
): CartLine {
  const resolved = resolvePrice(line.pricing_context, quantity);
  return {
    ...line,
    quantity,
    base_unit_price: resolved.base_unit_price,
    tier_id: resolved.applied_tier?.tier_id ?? null,
    tier_code: resolved.applied_tier?.tier_code ?? null,
    tier_min_qty: resolved.applied_tier?.min_qty ?? null,
    tier_unit_price: resolved.tier_unit_price,
    promotion_id: resolved.applied_promotion?.promotion_id ?? null,
    promotion_type: resolved.applied_promotion?.promotion_type ?? null,
    promotion_value: resolved.applied_promotion?.value ?? null,
    promotion_discount: resolved.promotion_discount,
    unit_price: resolved.final_unit_price,
    line_total: multiplyMoneyByQuantity(resolved.final_unit_price, quantity),
    pricing_resolved_at: resolved.pricing_resolved_at,
    pricing_time_status: resolved.pricing_time_status,
    pricing_warnings: [...resolved.warnings],
  };
}

export function addItem(
  cart: Cart,
  item: LookupResultBoundary,
  quantity: string = "1",
): Cart {
  if (cart.business_id !== item.business_id) {
    throw new CartError("Item belongs to a different business", CART_BUSINESS_MISMATCH);
  }

  const lineKey = generateLineKey(item.product_unit_id, item.price_version_id);
  const existingLine = cart.lines.find((line) => line.line_key === lineKey);

  if (existingLine) {
    const incomingBasePrice = validatePrice(item.unit_price);
    if (
      existingLine.base_unit_price !== incomingBasePrice ||
      existingLine.price_effective_from !== item.price_effective_from
    ) {
      throw new CartError(
        "Price context conflict for the same item",
        CART_PRICE_CONTEXT_CONFLICT,
      );
    }
    const addedQuantity = validateQuantity(quantity, item.allow_decimal_qty);
    const nextQuantity = quantityAdd(existingLine.quantity, addedQuantity);
    return setLineQuantity(cart, lineKey, nextQuantity);
  }

  const validatedQuantity = validateQuantity(quantity, item.allow_decimal_qty);
  const pricingContext = clonePricingContext(item);
  const line = withResolvedPrice(
    {
      line_key: lineKey,
      product_id: item.product_id,
      product_unit_id: item.product_unit_id,
      product_name: item.product_name,
      unit_code: item.unit_code,
      variant_name: item.variant_name,
      sku: item.sku,
      barcode: item.barcode,
      allow_decimal_qty: item.allow_decimal_qty,
      price_version_id: item.price_version_id,
      price_effective_from: item.price_effective_from,
      pricing_context: pricingContext,
      conversion_factor: item.conversion_factor,
      track_inventory: item.track_inventory,
    },
    validatedQuantity,
  );

  return {
    ...cart,
    lines: [...cart.lines, line],
  };
}

export function setLineQuantity(cart: Cart, lineKey: string, quantity: string): Cart {
  const lineIndex = cart.lines.findIndex((line) => line.line_key === lineKey);
  if (lineIndex === -1) return cart;

  const line = cart.lines[lineIndex]!;
  const validatedQuantity = validateQuantity(quantity, line.allow_decimal_qty);
  const nextLine = withResolvedPrice(line, validatedQuantity);
  const lines = [...cart.lines];
  lines[lineIndex] = nextLine;

  return {
    ...cart,
    lines,
  };
}

export function removeLine(cart: Cart, lineKey: string): Cart {
  return {
    ...cart,
    lines: cart.lines.filter((line) => line.line_key !== lineKey),
  };
}

export function clearCart(cart: Cart): Cart {
  return {
    ...cart,
    lines: [],
  };
}
