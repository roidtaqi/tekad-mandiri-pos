import { describe, expect, it } from "vitest";

import {
  calculateHistoricalReturnAmount,
  isFullReturn,
} from "./return-calculation.js";

describe("return calculation", () => {
  it("uses the immutable historical line value for a partial return", () => {
    expect(
      calculateHistoricalReturnAmount([
        {
          line_total: "25000.0000",
          sold_quantity: "2.000000",
          return_quantity: "1.000000",
        },
        {
          line_total: "10000.0000",
          sold_quantity: "1.000000",
          return_quantity: "1.000000",
        },
      ]),
    ).toBe("22500");
  });

  it("matches the server four-decimal rounding per returned line", () => {
    expect(
      calculateHistoricalReturnAmount([
        {
          line_total: "10.0000",
          sold_quantity: "3.000000",
          return_quantity: "2.000000",
        },
      ]),
    ).toBe("6.6666");
  });

  it("rejects zero and over-return quantities", () => {
    expect(() =>
      calculateHistoricalReturnAmount([
        { line_total: "10000", sold_quantity: "1", return_quantity: "0" },
      ]),
    ).toThrow("lebih dari nol");
    expect(() =>
      calculateHistoricalReturnAmount([
        { line_total: "10000", sold_quantity: "1", return_quantity: "2" },
      ]),
    ).toThrow("tidak melebihi");
  });

  it("uses server remaining quantity as the retry-safe upper bound", () => {
    expect(() =>
      calculateHistoricalReturnAmount([
        {
          line_total: "30000",
          maximum_return_quantity: "1",
          sold_quantity: "3",
          return_quantity: "2",
        },
      ]),
    ).toThrow("sisa yang dapat diretur");
    expect(calculateHistoricalReturnAmount([
      {
        line_total: "30000",
        maximum_return_quantity: "1",
        sold_quantity: "3",
        return_quantity: "1",
      },
    ])).toBe("10000");
  });

  it("classifies a return as full only when every sold line is fully selected", () => {
    expect(
      isFullReturn(2, [
        { sold_quantity: "2", return_quantity: "2" },
        { sold_quantity: "1", return_quantity: "1" },
      ]),
    ).toBe(true);
    expect(
      isFullReturn(2, [{ sold_quantity: "2", return_quantity: "2" }]),
    ).toBe(false);
    expect(
      isFullReturn(1, [{ sold_quantity: "2", return_quantity: "1" }]),
    ).toBe(false);
  });
});
