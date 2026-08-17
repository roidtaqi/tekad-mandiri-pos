import { PosPublishedRetailPrice, PricingError } from "@kastur/contracts";
import { parseMoney, MoneyValue } from "@kastur/numeric";

export interface ResolvedPublishedRetailPrice {
  price_version_id: string;
  product_unit_id: string;
  unit_price: MoneyValue;
  effective_from: string;
  effective_to: string | null;
}

export function resolvePublishedRetailPrice(
  cachedPrice: PosPublishedRetailPrice | null | undefined,
  productUnitId: string
): ResolvedPublishedRetailPrice {
  if (!cachedPrice) {
    throw new PricingError("PUBLISHED_RETAIL_PRICE_NOT_AVAILABLE", `Published retail price not available for product unit: ${productUnitId}`);
  }

  return {
    price_version_id: cachedPrice.price_version_id,
    product_unit_id: cachedPrice.product_unit_id,
    unit_price: parseMoney(cachedPrice.unit_price),
    effective_from: cachedPrice.effective_from,
    effective_to: cachedPrice.effective_to
  };
}
