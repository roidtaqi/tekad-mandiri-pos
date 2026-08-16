import { describe, expect, it } from "vitest";
import { parseQuantity, quantityAdd, quantitySubtract, multiplyQuantityByFactor, quantityCompare, quantityAbs, quantityNegate } from "../src/quantity.js";
import { parseDecimal } from "../src/decimal.js";
import { NumericError } from "../src/errors.js";

describe("Quantity primitives", () => {
  it("rejects non-string input at compile and runtime", () => {
    // @ts-expect-error test
    expect(() => parseQuantity(1.5)).toThrow(NumericError);
    expect(() => parseQuantity("")).toThrow(NumericError);
  });

  it("supports signed values", () => {
    const a = parseQuantity("2");
    const b = parseQuantity("5");
    expect(quantitySubtract(a, b)).toBe("-3");
  });

  it("adds and subtracts", () => {
    const a = parseQuantity("100.5");
    const b = parseQuantity("200.25");
    expect(quantityAdd(a, b)).toBe("300.75");
  });

  it("multiplies quantity by factor exactly", () => {
    const quantity = parseQuantity("1.5");
    const factor = parseDecimal("48");
    const result = multiplyQuantityByFactor(quantity, factor);
    expect(result).toBe("72");

    const fractionalFactor = parseDecimal("0.5");
    const result2 = multiplyQuantityByFactor(quantity, fractionalFactor);
    expect(result2).toBe("0.75");
  });

  it("compares correctly", () => {
    const a = parseQuantity("10");
    const b = parseQuantity("2");
    
    expect(quantityCompare(a, b)).toBe(1);
    expect(quantityCompare(b, a)).toBe(-1);
    expect(quantityCompare(a, a)).toBe(0);
  });

  it("supports abs and negate", () => {
    const a = parseQuantity("-10.5");
    expect(quantityAbs(a)).toBe("10.5");
    expect(quantityNegate(a)).toBe("10.5");
  });
});
