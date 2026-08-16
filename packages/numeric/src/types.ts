declare const _decimalBrand: unique symbol;
export type DecimalValue = string & { readonly [_decimalBrand]: "DecimalValue" };

declare const _moneyBrand: unique symbol;
export type MoneyValue = string & { readonly [_moneyBrand]: "MoneyValue" };

declare const _quantityBrand: unique symbol;
export type QuantityValue = string & { readonly [_quantityBrand]: "QuantityValue" };

export const RoundingMode = {
  UP: "UP",
  DOWN: "DOWN",
  CEIL: "CEIL",
  FLOOR: "FLOOR",
  HALF_UP: "HALF_UP",
  HALF_DOWN: "HALF_DOWN",
  HALF_EVEN: "HALF_EVEN"
} as const;

export type RoundingModeKey = keyof typeof RoundingMode;
