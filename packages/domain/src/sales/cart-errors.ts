export const CART_BUSINESS_MISMATCH = "CART_BUSINESS_MISMATCH";
export const CART_PRICE_CONTEXT_CONFLICT = "CART_PRICE_CONTEXT_CONFLICT";
export const INVALID_CART_QUANTITY = "INVALID_CART_QUANTITY";
export const DECIMAL_QUANTITY_NOT_ALLOWED = "DECIMAL_QUANTITY_NOT_ALLOWED";
export const INVALID_CART_PRICE = "INVALID_CART_PRICE";

export class CartError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CartError";
  }
}
