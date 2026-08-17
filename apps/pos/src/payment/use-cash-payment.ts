import { useState, useMemo, useCallback } from "react";
import { evaluateCashSettlement, type CashSettlementEvaluation } from "@kastur/domain";

export function useCashPayment(amountDue: string) {
  const [amountTenderedInput, setAmountTenderedInput] = useState("0");

  const evaluation: CashSettlementEvaluation = useMemo(() => {
    try {
      // Treat empty string as 0 to prevent typing errors
      const safeTender = amountTenderedInput.trim() === "" ? "0" : amountTenderedInput;
      return evaluateCashSettlement(amountDue, safeTender);
    } catch {
      // Fallback evaluation if input is completely invalid
      return evaluateCashSettlement(amountDue, "0");
    }
  }, [amountDue, amountTenderedInput]);

  const setAmountTendered = useCallback((value: string) => {
    setAmountTenderedInput(value);
  }, []);

  const useExactCash = useCallback(() => {
    setAmountTenderedInput(amountDue);
  }, [amountDue]);

  const resetCashPayment = useCallback(() => {
    setAmountTenderedInput("0");
  }, []);

  return {
    amountTenderedInput,
    setAmountTendered,
    evaluation,
    useExactCash,
    resetCashPayment,
  };
}
