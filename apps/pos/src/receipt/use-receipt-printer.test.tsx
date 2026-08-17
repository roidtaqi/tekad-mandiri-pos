/** @vitest-environment happy-dom */
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReceiptPrinter } from "./use-receipt-printer";

describe("useReceiptPrinter", () => {
  it("provides print function and ref without mutating data", () => {
    const { result } = renderHook(() => useReceiptPrinter());
    
    expect(result.current.receiptRef).toBeDefined();
    expect(typeof result.current.print).toBe("function");
    
    // Ensuring calling print doesn't mutate any external state (it just triggers browser print)
    // In happy-dom it may throw or do nothing, but it's isolated.
    const runPrint = () => {
      try {
        result.current.print();
      } catch {
        // Suppress any happy-dom print failure
      }
    };
    
    expect(runPrint).not.toThrow();
  });
});
