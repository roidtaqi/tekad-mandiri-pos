import { MoneyValue, QuantityValue } from "./types.js";
import { fromStringSafe, toCanonicalString } from "./decimal-engine.js";

export function parseMoney(value: string): MoneyValue {
  return toCanonicalString(fromStringSafe(value)) as MoneyValue;
}

export function moneyAdd(a: MoneyValue, b: MoneyValue): MoneyValue {
  return toCanonicalString(fromStringSafe(a).plus(fromStringSafe(b))) as MoneyValue;
}

export function moneySubtract(a: MoneyValue, b: MoneyValue): MoneyValue {
  return toCanonicalString(fromStringSafe(a).minus(fromStringSafe(b))) as MoneyValue;
}

export function moneyCompare(a: MoneyValue, b: MoneyValue): -1 | 0 | 1 {
  const d1 = fromStringSafe(a);
  const d2 = fromStringSafe(b);
  if (d1.eq(d2)) return 0;
  return d1.lt(d2) ? -1 : 1;
}

export function moneyAbs(a: MoneyValue): MoneyValue {
  return toCanonicalString(fromStringSafe(a).abs()) as MoneyValue;
}

export function moneyNegate(a: MoneyValue): MoneyValue {
  return toCanonicalString(fromStringSafe(a).neg()) as MoneyValue;
}

export function multiplyMoneyByQuantity(unitAmount: MoneyValue, quantity: QuantityValue): MoneyValue {
  return toCanonicalString(fromStringSafe(unitAmount).times(fromStringSafe(quantity))) as MoneyValue;
}
