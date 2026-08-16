import { Decimal } from "decimal.js";
import { NumericError, ERROR_CODES } from "./errors.js";
import { RoundingModeKey, RoundingMode } from "./types.js";

// ARITHMETIC GUARD PRECISION (not database limit, just to avoid IEEE 754 float traps in intermediate ops)
const GUARD_PRECISION = 80;

// Private configured constructor
export const KasturDecimal = Decimal.clone({
  precision: GUARD_PRECISION,
  rounding: Decimal.ROUND_HALF_EVEN, // Explicit internal arithmetic guard rounding
  toExpNeg: -1e9, // Effectively disable exponential serialization for negative exponents
  toExpPos: 1e9,  // Effectively disable exponential serialization for positive exponents
});

const DECIMAL_REGEX = /^-?\d+(?:\.\d+)?$/;

export function mapRoundingMode(mode: RoundingModeKey): number {
  switch (mode) {
    case RoundingMode.UP:
      return Decimal.ROUND_UP;
    case RoundingMode.DOWN:
      return Decimal.ROUND_DOWN;
    case RoundingMode.CEIL:
      return Decimal.ROUND_CEIL;
    case RoundingMode.FLOOR:
      return Decimal.ROUND_FLOOR;
    case RoundingMode.HALF_UP:
      return Decimal.ROUND_HALF_UP;
    case RoundingMode.HALF_DOWN:
      return Decimal.ROUND_HALF_DOWN;
    case RoundingMode.HALF_EVEN:
      return Decimal.ROUND_HALF_EVEN;
    default:
      throw new NumericError(ERROR_CODES.INVALID_ROUNDING_MODE, "Invalid rounding mode.");
  }
}

export function fromStringSafe(value: string | unknown): Decimal {
  if (typeof value !== "string") {
    throw new NumericError(ERROR_CODES.INVALID_DECIMAL, "Decimal value must be parsed from a string");
  }

  // Reject NaN, Infinity, scientific notation, etc. (allows leading zeroes)
  if (!DECIMAL_REGEX.test(value)) {
    throw new NumericError(ERROR_CODES.INVALID_DECIMAL, `Invalid decimal string format: ${value}`);
  }

  try {
    const d = new KasturDecimal(value);
    if (d.isNaN() || !d.isFinite()) {
      throw new NumericError(ERROR_CODES.INVALID_DECIMAL, `Invalid decimal string: ${value}`);
    }
    return d;
  } catch {
    throw new NumericError(ERROR_CODES.INVALID_DECIMAL, "Invalid decimal value.");
  }
}

export function toCanonicalString(d: Decimal): string {
  if (d.isZero()) {
    return "0";
  }
  // toFixed() without arguments outputs full precision without exponential notation,
  // but it might pad with zeros. toString() outputs exactly the needed digits.
  // We disabled toExpPos/Neg so toString() won't use exponent.
  return d.toString();
}

export function assertNoZeroDivision(d: Decimal): void {
  if (d.isZero()) {
    throw new NumericError(ERROR_CODES.DIVISION_BY_ZERO, "Division by zero is not permitted.");
  }
}
