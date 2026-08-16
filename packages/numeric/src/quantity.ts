import { DecimalValue, QuantityValue } from "./types.js";
import { fromStringSafe, toCanonicalString } from "./decimal-engine.js";

export function parseQuantity(value: string): QuantityValue {
  return toCanonicalString(fromStringSafe(value)) as QuantityValue;
}

export function quantityAdd(a: QuantityValue, b: QuantityValue): QuantityValue {
  return toCanonicalString(fromStringSafe(a).plus(fromStringSafe(b))) as QuantityValue;
}

export function quantitySubtract(a: QuantityValue, b: QuantityValue): QuantityValue {
  return toCanonicalString(fromStringSafe(a).minus(fromStringSafe(b))) as QuantityValue;
}

export function quantityCompare(a: QuantityValue, b: QuantityValue): -1 | 0 | 1 {
  const d1 = fromStringSafe(a);
  const d2 = fromStringSafe(b);
  if (d1.eq(d2)) return 0;
  return d1.lt(d2) ? -1 : 1;
}

export function quantityAbs(a: QuantityValue): QuantityValue {
  return toCanonicalString(fromStringSafe(a).abs()) as QuantityValue;
}

export function quantityNegate(a: QuantityValue): QuantityValue {
  return toCanonicalString(fromStringSafe(a).neg()) as QuantityValue;
}

export function multiplyQuantityByFactor(quantity: QuantityValue, factor: DecimalValue): QuantityValue {
  return toCanonicalString(fromStringSafe(quantity).times(fromStringSafe(factor))) as QuantityValue;
}
