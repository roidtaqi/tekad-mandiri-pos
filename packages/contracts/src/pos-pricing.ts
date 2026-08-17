export interface PosPublishedRetailPrice {
  price_version_id: string;
  product_unit_id: string;
  unit_price: string;
  effective_from: string;
  effective_to: string | null;
}

export interface PosPublishedRetailPriceBootstrapSnapshot {
  bootstrap_version: 1;
  business_id: string;
  server_time: string;
  prices: readonly PosPublishedRetailPrice[];
}

export type PricingErrorCode = 
  | "PUBLISHED_RETAIL_PRICE_NOT_AVAILABLE"
  | "PRICING_PERMISSION_DENIED";

export class PricingError extends Error {
  constructor(
    public readonly code: PricingErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PricingError";
  }
}
