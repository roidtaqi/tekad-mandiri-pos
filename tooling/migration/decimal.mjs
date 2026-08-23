// @ts-check

const DECIMAL_LITERAL = /^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/u;

/**
 * @typedef {{ coefficient: bigint, scale: number }} ParsedDecimal
 */

/** @param {string} value @param {string} [field] @returns {ParsedDecimal} */
function parseParts(value, field = "decimal") {
  if (typeof value !== "string" || value.trim() !== value) {
    throw new Error(`${field} must be a decimal string without surrounding whitespace.`);
  }
  const match = DECIMAL_LITERAL.exec(value);
  if (match === null) {
    throw new Error(`${field} must be a plain JSON decimal value.`);
  }

  const sign = match[1] === "-" ? -1n : 1n;
  let digits = `${match[2] ?? "0"}${match[3] ?? ""}`.replace(/^0+(?=[0-9])/u, "");
  const exponent = Number.parseInt(match[4] ?? "0", 10);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10_000) {
    throw new Error(`${field} exponent is outside the supported range.`);
  }
  let scale = (match[3]?.length ?? 0) - exponent;
  if (scale < 0) {
    digits += "0".repeat(-scale);
    scale = 0;
  }

  let coefficient = BigInt(digits) * sign;
  if (coefficient === 0n) return { coefficient: 0n, scale: 0 };
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return { coefficient, scale };
}

/** @param {ParsedDecimal} value */
function formatParts(value) {
  if (value.coefficient === 0n) return "0";
  const negative = value.coefficient < 0n;
  const digits = (negative ? -value.coefficient : value.coefficient).toString();
  if (value.scale === 0) return `${negative ? "-" : ""}${digits}`;
  const padded = digits.padStart(value.scale + 1, "0");
  const split = padded.length - value.scale;
  return `${negative ? "-" : ""}${padded.slice(0, split)}.${padded.slice(split)}`;
}

/** @param {string} value @param {string} [field] */
export function canonicalDecimal(value, field = "decimal") {
  return formatParts(parseParts(value, field));
}

/** @param {string} value @param {number} maximumScale @param {string} field */
export function validateDecimalScale(value, maximumScale, field) {
  const parsed = parseParts(value, field);
  if (parsed.scale > maximumScale) {
    throw new Error(`${field} has more than ${maximumScale} fractional digits.`);
  }
  return formatParts(parsed);
}

/** @param {string} value @param {string} field */
export function requireNonnegativeDecimal(value, field) {
  const parsed = parseParts(value, field);
  if (parsed.coefficient < 0n) throw new Error(`${field} must not be negative.`);
  return formatParts(parsed);
}

/** @param {string} value */
export function decimalIsZero(value) {
  return parseParts(value).coefficient === 0n;
}

/** @param {string} left @param {string} right */
export function decimalAdd(left, right) {
  const first = parseParts(left);
  const second = parseParts(right);
  const scale = Math.max(first.scale, second.scale);
  const firstCoefficient = first.coefficient * 10n ** BigInt(scale - first.scale);
  const secondCoefficient = second.coefficient * 10n ** BigInt(scale - second.scale);
  return formatParts({ coefficient: firstCoefficient + secondCoefficient, scale });
}

/** @param {string} left @param {string} right */
export function decimalMultiply(left, right) {
  const first = parseParts(left);
  const second = parseParts(right);
  return formatParts({
    coefficient: first.coefficient * second.coefficient,
    scale: first.scale + second.scale,
  });
}

/** @param {readonly string[]} values */
export function decimalSum(values) {
  return values.reduce((total, value) => decimalAdd(total, value), "0");
}

/** @param {string} left @param {string} right */
export function decimalEquals(left, right) {
  return canonicalDecimal(left) === canonicalDecimal(right);
}

/** @param {string} left @param {string} right */
export function decimalCompare(left, right) {
  const first = parseParts(left);
  const second = parseParts(right);
  const scale = Math.max(first.scale, second.scale);
  const firstCoefficient = first.coefficient * 10n ** BigInt(scale - first.scale);
  const secondCoefficient = second.coefficient * 10n ** BigInt(scale - second.scale);
  return firstCoefficient < secondCoefficient ? -1 : firstCoefficient > secondCoefficient ? 1 : 0;
}
