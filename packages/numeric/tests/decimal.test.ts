import { describe, expect, it } from "vitest";
import { 
  parseDecimal, decimalAdd, decimalSubtract, decimalMultiply, decimalDivide, 
  decimalCompare, decimalAbs, decimalNegate, decimalIsZero, decimalIsPositive, decimalIsNegative 
} from "../src/decimal.js";
import { NumericError } from "../src/errors.js";

describe("Decimal primitives", () => {
  it("rejects non-string values at runtime", () => {
    // @ts-expect-error test
    expect(() => parseDecimal(10)).toThrow(NumericError);
    // @ts-expect-error test
    expect(() => parseDecimal(null)).toThrow(NumericError);
    // @ts-expect-error test
    expect(() => parseDecimal(undefined)).toThrow(NumericError);
    // @ts-expect-error test
    expect(() => parseDecimal({})).toThrow(NumericError);
  });

  it("rejects exponential notation, NaN, and Infinity", () => {
    expect(() => parseDecimal("1e3")).toThrow(NumericError);
    expect(() => parseDecimal("1E-3")).toThrow(NumericError);
    expect(() => parseDecimal("NaN")).toThrow(NumericError);
    expect(() => parseDecimal("Infinity")).toThrow(NumericError);
    expect(() => parseDecimal("-Infinity")).toThrow(NumericError);
  });

  it("rejects invalid strings", () => {
    expect(() => parseDecimal("")).toThrow(NumericError);
    expect(() => parseDecimal(" ")).toThrow(NumericError);
    expect(() => parseDecimal(" 1")).toThrow(NumericError);
    expect(() => parseDecimal("1 ")).toThrow(NumericError);
    expect(() => parseDecimal("+1")).toThrow(NumericError);
    expect(() => parseDecimal(".5")).toThrow(NumericError);
    expect(() => parseDecimal("1.")).toThrow(NumericError);
    expect(() => parseDecimal("1,000")).toThrow(NumericError);
  });

  it("canonicalizes representations correctly", () => {
    expect(parseDecimal("001.2500")).toBe("1.25");
    expect(parseDecimal("000")).toBe("0");
    expect(parseDecimal("-0")).toBe("0");
    expect(parseDecimal("-0.000")).toBe("0");
    expect(parseDecimal("10.5000")).toBe("10.5");
    expect(parseDecimal("0")).toBe("0");
  });

  it("adds, subtracts, multiplies, divides exactly", () => {
    const a = parseDecimal("0.1");
    const b = parseDecimal("0.2");
    expect(decimalAdd(a, b)).toBe("0.3");

    const c = parseDecimal("0.3");
    expect(decimalSubtract(c, a)).toBe("0.2");

    expect(decimalMultiply(a, b)).toBe("0.02");

    const d = parseDecimal("1");
    const e = parseDecimal("8");
    expect(decimalDivide(d, e)).toBe("0.125");
  });

  it("handles numbers beyond MAX_SAFE_INTEGER", () => {
    const huge = parseDecimal("9007199254740993");
    const one = parseDecimal("1");
    expect(decimalAdd(huge, one)).toBe("9007199254740994");
  });

  it("handles high precision division", () => {
    const one = parseDecimal("1");
    const three = parseDecimal("3");
    const div = decimalDivide(one, three);
    // Should have up to 80 digits
    expect(div.startsWith("0.33333333333333333333")).toBe(true);
  });

  it("handles Costing precision example division without rounding", () => {
    const amount = parseDecimal("103000");
    const divBy = parseDecimal("36");
    const result = decimalDivide(amount, divBy);
    expect(result.startsWith("2861.111111111111111111")).toBe(true);
    expect(result).not.toBe("2861"); // not early rounded
  });

  it("throws DIVISION_BY_ZERO with stable error", () => {
    const a = parseDecimal("10");
    const b = parseDecimal("0");
    let err;
    try {
      decimalDivide(a, b);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(NumericError);
    expect((err as NumericError).code).toBe("DIVISION_BY_ZERO");
  });

  it("compares correctly", () => {
    const a = parseDecimal("10");
    const b = parseDecimal("2");
    
    expect(decimalCompare(a, b)).toBe(1); // "10" > "2" numerically, even though lexically "10" < "2"
    expect(decimalCompare(b, a)).toBe(-1);
    expect(decimalCompare(a, a)).toBe(0);
  });

  it("supports abs and negate", () => {
    const a = parseDecimal("-10.5");
    expect(decimalAbs(a)).toBe("10.5");
    expect(decimalNegate(a)).toBe("10.5");

    const b = parseDecimal("10.5");
    expect(decimalAbs(b)).toBe("10.5");
    expect(decimalNegate(b)).toBe("-10.5");
  });

  it("supports predicates", () => {
    const zero = parseDecimal("0");
    const pos = parseDecimal("1");
    const neg = parseDecimal("-1");

    expect(decimalIsZero(zero)).toBe(true);
    expect(decimalIsPositive(zero)).toBe(false);
    expect(decimalIsNegative(zero)).toBe(false);

    expect(decimalIsZero(pos)).toBe(false);
    expect(decimalIsPositive(pos)).toBe(true);
    expect(decimalIsNegative(pos)).toBe(false);

    expect(decimalIsZero(neg)).toBe(false);
    expect(decimalIsPositive(neg)).toBe(false);
    expect(decimalIsNegative(neg)).toBe(true);
  });
});
