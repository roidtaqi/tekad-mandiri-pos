import { describe, expect, it } from "vitest";
import { parseMoney, moneyAdd, moneySubtract, multiplyMoneyByQuantity, moneyCompare, moneyAbs, moneyNegate } from "../src/money.js";
import { parseQuantity } from "../src/quantity.js";
import { NumericError } from "../src/errors.js";

describe("Money primitives", () => {
  it("rejects non-string input at compile and runtime", () => {
    // @ts-expect-error test
    expect(() => parseMoney(10)).toThrow(NumericError);
    expect(() => parseMoney("")).toThrow(NumericError);
  });

  it("supports signed values", () => {
    const a = parseMoney("100");
    const b = parseMoney("150");
    expect(moneySubtract(a, b)).toBe("-50");
  });

  it("adds and subtracts", () => {
    const a = parseMoney("100.50");
    const b = parseMoney("200.25");
    expect(moneyAdd(a, b)).toBe("300.75");
  });

  it("multiplies money by quantity", () => {
    const unitAmount = parseMoney("3500.0000");
    const quantity = parseQuantity("2.5");
    const result = multiplyMoneyByQuantity(unitAmount, quantity);
    expect(result).toBe("8750"); // Exact arithmetic, no decimals left, canonicalized
  });

  it("compares correctly", () => {
    const a = parseMoney("10");
    const b = parseMoney("2");
    
    expect(moneyCompare(a, b)).toBe(1);
    expect(moneyCompare(b, a)).toBe(-1);
    expect(moneyCompare(a, a)).toBe(0);
  });

  it("supports abs and negate", () => {
    const a = parseMoney("-10.5");
    expect(moneyAbs(a)).toBe("10.5");
    expect(moneyNegate(a)).toBe("10.5");
  });
});
