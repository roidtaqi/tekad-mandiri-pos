import { describe, it, expect } from "vitest";
import { getCashMovementDirection, calculateExpectedCash, calculateShiftClosing } from "./cash-ledger.js";
import { CashMovementDTO } from "@kastur/contracts";

describe("cash-ledger", () => {
  it("determines correct direction for movement types", () => {
    expect(getCashMovementDirection("OPENING_BALANCE")).toBe("IN");
    expect(getCashMovementDirection("CASH_SALE")).toBe("IN");
    expect(getCashMovementDirection("CASH_IN")).toBe("IN");
    expect(getCashMovementDirection("CASH_OUT")).toBe("OUT");
    expect(getCashMovementDirection("CASH_REFUND")).toBe("OUT");
    expect(getCashMovementDirection("CASH_REVERSAL")).toBe("OUT");
    expect(getCashMovementDirection("SAFE_DROP")).toBe("OUT");
  });

  it("calculates expected cash correctly", () => {
    const movements: CashMovementDTO[] = [
      {
        id: "1", shift_id: "s1", movement_type: "OPENING_BALANCE", amount: "500000", direction: "IN",
        source_type: "SHIFT", source_id: "s1", reason_code: null, notes: null, occurred_at: "2026-08-18T10:00:00Z", actor_user_id: "u1", correlation_id: null
      },
      {
        id: "2", shift_id: "s1", movement_type: "CASH_SALE", amount: "100000", direction: "IN",
        source_type: "TRANSACTION", source_id: "t1", reason_code: null, notes: null, occurred_at: "2026-08-18T10:05:00Z", actor_user_id: "u1", correlation_id: null
      },
      {
        id: "3", shift_id: "s1", movement_type: "CASH_OUT", amount: "50000", direction: "OUT",
        source_type: "CASH_MOVEMENT", source_id: "3", reason_code: "EXPENSE", notes: null, occurred_at: "2026-08-18T10:10:00Z", actor_user_id: "u1", correlation_id: null
      }
    ];

    const expected = calculateExpectedCash(movements);
    expect(expected).toBe("550000");
  });

  it("calculates shift closing correctly with MATCHED variance", () => {
    const movements: CashMovementDTO[] = [
      {
        id: "1", shift_id: "s1", movement_type: "OPENING_BALANCE", amount: "500000", direction: "IN",
        source_type: "SHIFT", source_id: "s1", reason_code: null, notes: null, occurred_at: "2026-08-18T10:00:00Z", actor_user_id: "u1", correlation_id: null
      },
      {
        id: "2", shift_id: "s1", movement_type: "CASH_SALE", amount: "100000", direction: "IN",
        source_type: "TRANSACTION", source_id: "t1", reason_code: null, notes: null, occurred_at: "2026-08-18T10:05:00Z", actor_user_id: "u1", correlation_id: null
      }
    ];
    
    // 600000 expected
    const result = calculateShiftClosing(movements, "600000" as any);
    expect(result.expected_cash).toBe("600000");
    expect(result.variance).toBe("0");
    expect(result.variance_type).toBe("MATCHED");
    expect(result.opening_cash).toBe("500000");
    expect(result.cash_sales).toBe("100000");
  });
});
