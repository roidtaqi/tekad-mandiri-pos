import { DecimalValue, RoundingModeKey } from "./types.js";
import { fromStringSafe, mapRoundingMode, toCanonicalString } from "./decimal-engine.js";
import { Decimal } from "decimal.js";
import { NumericError, ERROR_CODES } from "./errors.js";

const GUARD_PRECISION = 80;

function validateDecimalPlaces(decimalPlaces: number): void {
  if (!Number.isSafeInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > GUARD_PRECISION) {
    throw new NumericError(ERROR_CODES.INVALID_SCALE, `Invalid decimal places: ${decimalPlaces}`);
  }
}

function validatePrecisionScaleConfiguration(precision: number, scale: number): void {
  if (!Number.isSafeInteger(precision) || precision <= 0) {
    throw new NumericError(ERROR_CODES.INVALID_PRECISION, `Invalid precision: ${precision}`);
  }
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > precision) {
    throw new NumericError(ERROR_CODES.INVALID_SCALE, `Invalid scale: ${scale}`);
  }
}

export function quantizeDecimal(
  value: DecimalValue,
  decimalPlaces: number,
  roundingMode: RoundingModeKey
): DecimalValue {
  validateDecimalPlaces(decimalPlaces);
  const d = fromStringSafe(value);
  const mode = mapRoundingMode(roundingMode) as Decimal.Rounding;
  return toCanonicalString(d.toDecimalPlaces(decimalPlaces, mode)) as DecimalValue;
}

export function toFixedScale(
  value: DecimalValue | string, // Can take parsed values for serialization
  decimalPlaces: number,
  roundingMode?: RoundingModeKey
): string {
  validateDecimalPlaces(decimalPlaces);
  const d = fromStringSafe(value);
  
  if (roundingMode) {
    const mode = mapRoundingMode(roundingMode) as Decimal.Rounding;
    return d.toFixed(decimalPlaces, mode);
  }
  
  // toFixed without mode applies ROUND_HALF_UP in decimal.js by default,
  // but if we are just padding (no precision loss), it's safe.
  // We should enforce mode if it causes rounding, but if it doesn't, toFixed works.
  // Let's use a safe path if they just want to pad:
  // If toDecimalPlaces changes the value, then they NEED a rounding mode.
  if (!roundingMode) {
    // If it has more decimal places than requested, it will round by default, which violates "explicit rounding mode".
    if (d.decimalPlaces() > decimalPlaces) {
      throw new NumericError(
        ERROR_CODES.INVALID_SCALE,
        "Explicit rounding mode required for scale reduction."
      );
    }
  }

  // Decimal places fits or needs padding.
  return d.toFixed(decimalPlaces);
}

export function fitsPrecisionScale(
  value: DecimalValue,
  precision: number,
  scale: number
): boolean {
  validatePrecisionScaleConfiguration(precision, scale);
  const d = fromStringSafe(value);
  
  // If it has more fractional digits than scale, it doesn't fit
  if (d.decimalPlaces() > scale) {
    return false;
  }

  // Integer digits = precision - scale.
  // If total digits (ignoring fractional zeros that exceed scale, but we already validated scale) > precision, it fails.
  // We can just check the number of digits before the decimal point.
  // (Note: decimal.js `precision(true)` gives total significant digits. `d.e` is the exponent, which relates to integer digits).
  // Easiest is to look at integer digits explicitly.
  // If it's a fraction like 0.5, integer part is 0, string length is 1 (character '0'), but mathematically 0 digits.
  // Let's be precise:
  const mathIntDigits = d.isZero() || d.abs().lt(1) ? 0 : d.abs().floor().toString().length;
  
  const maxIntDigits = precision - scale;
  
  if (mathIntDigits > maxIntDigits) {
    return false;
  }

  return true;
}

export function assertFitsPrecisionScale(
  value: DecimalValue,
  precision: number,
  scale: number
): void {
  if (!fitsPrecisionScale(value, precision, scale)) {
    throw new NumericError(
      ERROR_CODES.DECIMAL_PRECISION_OVERFLOW,
      `Value ${value} exceeds allowed numeric(${precision},${scale}) precision.`
    );
  }
}
