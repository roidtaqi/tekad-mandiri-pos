import { DecimalValue } from "./types.js";
import { fromStringSafe, toCanonicalString, assertNoZeroDivision } from "./decimal-engine.js";

export function parseDecimal(value: string): DecimalValue {
  return toCanonicalString(fromStringSafe(value)) as DecimalValue;
}

export function decimalAdd(a: DecimalValue, b: DecimalValue): DecimalValue {
  return toCanonicalString(fromStringSafe(a).plus(fromStringSafe(b))) as DecimalValue;
}

export function decimalSubtract(a: DecimalValue, b: DecimalValue): DecimalValue {
  return toCanonicalString(fromStringSafe(a).minus(fromStringSafe(b))) as DecimalValue;
}

export function decimalMultiply(a: DecimalValue, b: DecimalValue): DecimalValue {
  return toCanonicalString(fromStringSafe(a).times(fromStringSafe(b))) as DecimalValue;
}

export function decimalDivide(a: DecimalValue, b: DecimalValue): DecimalValue {
  const d = fromStringSafe(b);
  assertNoZeroDivision(d);
  return toCanonicalString(fromStringSafe(a).div(d)) as DecimalValue;
}

export function decimalCompare(a: DecimalValue, b: DecimalValue): -1 | 0 | 1 {
  const d1 = fromStringSafe(a);
  const d2 = fromStringSafe(b);
  if (d1.eq(d2)) return 0;
  return d1.lt(d2) ? -1 : 1;
}

export function decimalAbs(a: DecimalValue): DecimalValue {
  return toCanonicalString(fromStringSafe(a).abs()) as DecimalValue;
}

export function decimalNegate(a: DecimalValue): DecimalValue {
  return toCanonicalString(fromStringSafe(a).neg()) as DecimalValue;
}

export function decimalIsZero(a: DecimalValue): boolean {
  return fromStringSafe(a).isZero();
}

export function decimalIsPositive(a: DecimalValue): boolean {
  return fromStringSafe(a).isPositive() && !fromStringSafe(a).isZero();
}

export function decimalIsNegative(a: DecimalValue): boolean {
  return fromStringSafe(a).isNegative() && !fromStringSafe(a).isZero();
}
