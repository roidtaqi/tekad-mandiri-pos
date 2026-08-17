import { PricingError } from "@kastur/contracts";

export function createPricingPermissionError(): PricingError {
  return new PricingError("PRICING_PERMISSION_DENIED", "Requires workspace.pos.access permission");
}
