/** @vitest-environment happy-dom */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCashPayment } from "./use-cash-payment";

describe("useCashPayment", () => {
  it("APP-01: setting cash tender produces correct derived evaluation", () => {
    const { result } = renderHook(() => useCashPayment("37000"));
    
    act(() => {
      result.current.setAmountTendered("50000");
    });
    
    expect(result.current.evaluation.status).toBe("SETTLED");
    if (result.current.evaluation.status === "SETTLED") {
      expect(result.current.evaluation.change_due).toBe("13000");
    }
  });

  it("APP-02: Exact Cash action sets tender = current due and change = 0", () => {
    const { result } = renderHook(() => useCashPayment("37000"));
    
    act(() => {
      result.current.useExactCash();
    });
    
    expect(result.current.amountTenderedInput).toBe("37000");
    expect(result.current.evaluation.status).toBe("SETTLED");
    if (result.current.evaluation.status === "SETTLED") {
      expect(result.current.evaluation.change_due).toBe("0");
    }
  });

  it("APP-03: reset clears payment-entry state without mutating Cart", () => {
    const { result } = renderHook(() => useCashPayment("37000"));
    
    act(() => {
      result.current.setAmountTendered("50000");
    });
    
    act(() => {
      result.current.resetCashPayment();
    });
    
    expect(result.current.amountTenderedInput).toBe("0");
    expect(result.current.evaluation.status).toBe("INSUFFICIENT");
  });

  it("CART-01/CART-02/CART-03/CART-04: stale-total prevention when due changes", () => {
    const { result, rerender } = renderHook(({ due }) => useCashPayment(due), {
      initialProps: { due: "37000" },
    });
    
    act(() => {
      result.current.setAmountTendered("50000");
    });
    
    // initially settled
    expect(result.current.evaluation.status).toBe("SETTLED");
    if (result.current.evaluation.status === "SETTLED") {
      expect(result.current.evaluation.change_due).toBe("13000");
    }
    
    // Cart changes to 45000
    rerender({ due: "45000" });
    expect(result.current.evaluation.status).toBe("SETTLED");
    if (result.current.evaluation.status === "SETTLED") {
      expect(result.current.evaluation.change_due).toBe("5000");
    }
    
    // Cart changes to 55000
    rerender({ due: "55000" });
    expect(result.current.evaluation.status).toBe("INSUFFICIENT");
    if (result.current.evaluation.status === "INSUFFICIENT") {
      expect(result.current.evaluation.remaining_due).toBe("5000");
    }
  });
});
