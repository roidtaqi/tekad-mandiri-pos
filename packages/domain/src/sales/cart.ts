import { 
  parseMoney, 
  moneyAdd, 
  multiplyMoneyByQuantity, 
  parseQuantity, 
  quantityAdd, 
  quantityCompare,
  fitsPrecisionScale,
  type MoneyValue,
  type QuantityValue
} from "@kastur/numeric";
import {
  CART_BUSINESS_MISMATCH,
  CART_PRICE_CONTEXT_CONFLICT,
  DECIMAL_QUANTITY_NOT_ALLOWED,
  INVALID_CART_PRICE,
  INVALID_CART_QUANTITY,
  CartError,
} from "./cart-errors.js";

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
  readonly unit_price: MoneyValue;
  readonly line_total: MoneyValue;
  
  readonly conversion_factor: string;
  readonly track_inventory: boolean;
}

export interface CartTotals {
  readonly gross_subtotal: MoneyValue;
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
}

export function createCart(businessId: string): Cart {
  return {
    business_id: businessId,
    lines: [],
  };
}

export function calculateCartTotals(cart: Cart): CartTotals {
  let subtotal = parseMoney("0");
  for (const line of cart.lines) {
    subtotal = moneyAdd(subtotal, line.line_total);
  }
  return {
    gross_subtotal: subtotal,
    grand_total: subtotal,
  };
}

function generateLineKey(productUnitId: string, priceVersionId: string): string {
  return JSON.stringify([productUnitId, priceVersionId]);
}

function assertQuantityPrecision(qty: QuantityValue): void {
  if (!fitsPrecisionScale(qty, 20, 6)) {
    throw new CartError("Invalid cart quantity precision", INVALID_CART_QUANTITY);
  }
}

function validateQuantity(quantity: string, allowDecimal: boolean): QuantityValue {
  let canonicalQty: QuantityValue;
  try {
    canonicalQty = parseQuantity(quantity);
  } catch {
    throw new CartError("Invalid cart quantity format", INVALID_CART_QUANTITY);
  }

  assertQuantityPrecision(canonicalQty);

  if (quantityCompare(canonicalQty, parseQuantity("0")) <= 0) {
    throw new CartError("Quantity must be greater than zero", INVALID_CART_QUANTITY);
  }

  if (!allowDecimal) {
    // Check if canonical quantity has decimal part
    if (canonicalQty.includes(".")) {
      const parts = canonicalQty.split(".");
      if (parts[1] && parts[1] !== "0" && parts[1].match(/[^0]/)) {
        throw new CartError("Decimal quantity not allowed", DECIMAL_QUANTITY_NOT_ALLOWED);
      }
      canonicalQty = parseQuantity(parts[0]!);
    }
  }

  return canonicalQty;
}

function validatePrice(price: string): MoneyValue {
  let canonicalPrice: MoneyValue;
  try {
    canonicalPrice = parseMoney(price);
  } catch {
    throw new CartError("Invalid cart price format", INVALID_CART_PRICE);
  }
  
  if (canonicalPrice.startsWith("-")) {
    throw new CartError("Price cannot be negative", INVALID_CART_PRICE);
  }

  return canonicalPrice;
}

export function addItem(cart: Cart, item: LookupResultBoundary, quantity: string = "1"): Cart {
  if (cart.business_id !== item.business_id) {
    throw new CartError("Item belongs to a different business", CART_BUSINESS_MISMATCH);
  }

  const lineKey = generateLineKey(item.product_unit_id, item.price_version_id);
  const existingLine = cart.lines.find(l => l.line_key === lineKey);

  const unitPrice = validatePrice(item.unit_price);

  if (existingLine) {
    if (existingLine.unit_price !== unitPrice) {
      throw new CartError("Price context conflict for the same item", CART_PRICE_CONTEXT_CONFLICT);
    }
    const validatedAddQty = validateQuantity(quantity, item.allow_decimal_qty);
    const newQty = quantityAdd(existingLine.quantity, validatedAddQty);
    return setLineQuantity(cart, lineKey, newQty);
  }

  const validatedQty = validateQuantity(quantity, item.allow_decimal_qty);
  const lineTotal = multiplyMoneyByQuantity(unitPrice, validatedQty);

  const newLine: CartLine = {
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
    quantity: validatedQty,
    unit_price: unitPrice,
    line_total: lineTotal,
    conversion_factor: item.conversion_factor,
    track_inventory: item.track_inventory,
  };

  return {
    ...cart,
    lines: [...cart.lines, newLine],
  };
}

export function setLineQuantity(cart: Cart, lineKey: string, quantity: string): Cart {
  const lineIndex = cart.lines.findIndex(l => l.line_key === lineKey);
  if (lineIndex === -1) {
    return cart;
  }

  const line = cart.lines[lineIndex]!;
  const validatedQty = validateQuantity(quantity, line.allow_decimal_qty);
  const lineTotal = multiplyMoneyByQuantity(line.unit_price, validatedQty);

  const newLines = [...cart.lines];
  newLines[lineIndex] = {
    ...line,
    quantity: validatedQty,
    line_total: lineTotal,
  };

  return {
    ...cart,
    lines: newLines,
  };
}

export function removeLine(cart: Cart, lineKey: string): Cart {
  return {
    ...cart,
    lines: cart.lines.filter(l => l.line_key !== lineKey),
  };
}

export function clearCart(cart: Cart): Cart {
  return {
    ...cart,
    lines: [],
  };
}
