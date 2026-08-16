import { describe, expect, it } from "vitest";
import { quantizeDecimal, toFixedScale, fitsPrecisionScale, assertFitsPrecisionScale } from "../src/precision.js";
import { parseDecimal } from "../src/decimal.js";
import { NumericError } from "../src/errors.js";

describe("Precision and scale primitives", () => {
  describe("quantizeDecimal", () => {
    it("quantizes boundary/tie cases explicitly without default mode assumptions", () => {
      const posTie = parseDecimal("10.005");
      const negTie = parseDecimal("-10.005");

      // HALF_UP
      expect(quantizeDecimal(posTie, 2, "HALF_UP")).toBe("10.01");
      expect(quantizeDecimal(negTie, 2, "HALF_UP")).toBe("-10.01");

      // HALF_DOWN
      expect(quantizeDecimal(posTie, 2, "HALF_DOWN")).toBe("10");
      expect(quantizeDecimal(negTie, 2, "HALF_DOWN")).toBe("-10");

      // HALF_EVEN
      expect(quantizeDecimal(posTie, 2, "HALF_EVEN")).toBe("10"); // 10 is even
      expect(quantizeDecimal(negTie, 2, "HALF_EVEN")).toBe("-10"); // -10 is even
      const posTie2 = parseDecimal("10.015");
      const negTie2 = parseDecimal("-10.015");
      expect(quantizeDecimal(posTie2, 2, "HALF_EVEN")).toBe("10.02"); // 10.02 is even
      expect(quantizeDecimal(negTie2, 2, "HALF_EVEN")).toBe("-10.02"); // -10.02 is even

      // UP (away from zero)
      expect(quantizeDecimal(posTie, 2, "UP")).toBe("10.01");
      expect(quantizeDecimal(negTie, 2, "UP")).toBe("-10.01");

      // DOWN (towards zero)
      expect(quantizeDecimal(posTie, 2, "DOWN")).toBe("10");
      expect(quantizeDecimal(negTie, 2, "DOWN")).toBe("-10");

      // CEIL (towards +Infinity)
      expect(quantizeDecimal(posTie, 2, "CEIL")).toBe("10.01");
      expect(quantizeDecimal(negTie, 2, "CEIL")).toBe("-10");

      // FLOOR (towards -Infinity)
      expect(quantizeDecimal(posTie, 2, "FLOOR")).toBe("10");
      expect(quantizeDecimal(negTie, 2, "FLOOR")).toBe("-10.01");
    });

    it("rejects invalid scale or rounding mode arguments", () => {
      const val = parseDecimal("10.5");
      const assertErr = (fn: () => void, code: string) => {
        let err: any;
        try { fn(); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(NumericError);
        expect(err.code).toBe(code);
      };

      assertErr(() => quantizeDecimal(val, -1, "HALF_UP"), "INVALID_SCALE");
      assertErr(() => quantizeDecimal(val, 1.5, "HALF_UP"), "INVALID_SCALE");
      assertErr(() => quantizeDecimal(val, NaN, "HALF_UP"), "INVALID_SCALE");
      
      assertErr(() => quantizeDecimal(val, Infinity, "HALF_UP"), "INVALID_SCALE");
      
      // @ts-expect-error
      assertErr(() => quantizeDecimal(val, 2, "UNKNOWN"), "INVALID_ROUNDING_MODE");
    });
  });

  describe("toFixedScale", () => {
    it("returns fixed scale serialization without using Number", () => {
      const val = parseDecimal("6.5");
      expect(toFixedScale(val, 8)).toBe("6.50000000");
    });

    it("applies rounding mode if explicitly specified during scale reduction", () => {
      const val = parseDecimal("1.23456");
      expect(toFixedScale(val, 4, "HALF_UP")).toBe("1.2346");
    });

    it("throws if scale reduction is attempted without rounding mode", () => {
      const val = parseDecimal("1.23456");
      expect(() => toFixedScale(val, 4)).toThrow(NumericError);
    });

    it("allows padding without rounding mode", () => {
      const val = parseDecimal("3500");
      expect(toFixedScale(val, 4)).toBe("3500.0000");
    });

    it("rejects invalid scale or rounding mode arguments", () => {
      const val = parseDecimal("10.5");
      const assertErr = (fn: () => void, code: string) => {
        let err: any;
        try { fn(); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(NumericError);
        expect(err.code).toBe(code);
      };

      assertErr(() => toFixedScale(val, -1), "INVALID_SCALE");
      assertErr(() => toFixedScale(val, 1.5), "INVALID_SCALE");
      assertErr(() => toFixedScale(val, NaN), "INVALID_SCALE");
      assertErr(() => toFixedScale(val, Infinity), "INVALID_SCALE");
      
      // @ts-expect-error
      assertErr(() => toFixedScale(val, 2, ""), "INVALID_ROUNDING_MODE");
      // @ts-expect-error
      assertErr(() => toFixedScale(val, 2, null), "INVALID_ROUNDING_MODE");
    });
  });

  describe("fitsPrecisionScale", () => {
    it("validates NUMERIC constraints correctly without silent rounding", () => {
      // numeric(20, 8) means 20 total digits, 8 fractional digits. 
      // This leaves max 12 integer digits.
      const precision = 20;
      const scale = 8;

      // fits exactly
      expect(fitsPrecisionScale(parseDecimal("123456789012.12345678"), precision, scale)).toBe(true);
      
      // fraction that fits
      expect(fitsPrecisionScale(parseDecimal("0.12345678"), precision, scale)).toBe(true);

      // maximum integer digits
      expect(fitsPrecisionScale(parseDecimal("999999999999"), precision, scale)).toBe(true);

      // negative values
      expect(fitsPrecisionScale(parseDecimal("-999999999999"), precision, scale)).toBe(true);
      expect(fitsPrecisionScale(parseDecimal("-123456789012.12345678"), precision, scale)).toBe(true);

      // zero
      expect(fitsPrecisionScale(parseDecimal("0"), precision, scale)).toBe(true);

      // too many integer digits
      expect(fitsPrecisionScale(parseDecimal("1000000000000"), precision, scale)).toBe(false);
      expect(fitsPrecisionScale(parseDecimal("-1000000000000"), precision, scale)).toBe(false);

      // fraction requiring rounding -> rejected
      expect(fitsPrecisionScale(parseDecimal("0.123456789"), precision, scale)).toBe(false);
    });

    it("throws on invalid precision or scale configuration", () => {
      const val = parseDecimal("1");
      const assertErr = (fn: () => void, code: string) => {
        let err: any;
        try { fn(); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(NumericError);
        expect(err.code).toBe(code);
      };

      assertErr(() => fitsPrecisionScale(val, 0, 0), "INVALID_PRECISION");
      assertErr(() => fitsPrecisionScale(val, 1.5, 0), "INVALID_PRECISION");
      assertErr(() => fitsPrecisionScale(val, NaN, 0), "INVALID_PRECISION");
      assertErr(() => fitsPrecisionScale(val, Infinity, 0), "INVALID_PRECISION");
      
      assertErr(() => fitsPrecisionScale(val, 10, -1), "INVALID_SCALE");
      assertErr(() => fitsPrecisionScale(val, 10, 1.5), "INVALID_SCALE");
      assertErr(() => fitsPrecisionScale(val, 10, NaN), "INVALID_SCALE");
      assertErr(() => fitsPrecisionScale(val, 10, 11), "INVALID_SCALE");
      assertErr(() => fitsPrecisionScale(val, 10, Infinity), "INVALID_SCALE");
    });
  });

  describe("assertFitsPrecisionScale", () => {
    it("throws stable error on overflow", () => {
      expect(() => assertFitsPrecisionScale(parseDecimal("1000000000000"), 20, 8))
        .toThrowError(NumericError);
      let err;
      try {
        assertFitsPrecisionScale(parseDecimal("1000000000000"), 20, 8);
      } catch (e) {
        err = e;
      }
      expect((err as NumericError).code).toBe("DECIMAL_PRECISION_OVERFLOW");
    });
  });
});
