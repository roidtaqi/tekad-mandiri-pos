import { test, expect } from "vitest";
import { evaluateCashSettlement } from "../../src/sales/cash-settlement.js";
import { INVALID_AMOUNT_DUE, INVALID_CASH_TENDER } from "../../src/sales/payment-errors.js";

test("CASH-01: due 37000 + tendered 37000 -> SETTLED, payment 37000, change 0", () => {
  const result = evaluateCashSettlement("37000", "37000");
  expect(result).toEqual({
    status: "SETTLED",
    method_code: "CASH",
    confirmation_type: "CASH_CONFIRMED",
    amount_due: "37000",
    amount_tendered: "37000",
    payment_amount: "37000",
    remaining_due: "0",
    change_due: "0",
  });
});

test("CASH-02: due 37000 + tendered 50000 -> SETTLED, payment 37000, change 13000", () => {
  const result = evaluateCashSettlement("37000", "50000");
  expect(result).toEqual({
    status: "SETTLED",
    method_code: "CASH",
    confirmation_type: "CASH_CONFIRMED",
    amount_due: "37000",
    amount_tendered: "50000",
    payment_amount: "37000",
    remaining_due: "0",
    change_due: "13000",
  });
});

test("CASH-03: Over-tender never increases payment_amount above amount_due", () => {
  const result = evaluateCashSettlement("37000", "50000");
  // @ts-expect-error property does not exist on INSUFFICIENT, but we know it's SETTLED
  expect(result.payment_amount).toBe("37000");
});

test("UNDER-01: due 37000 + tendered 30000 -> INSUFFICIENT, remaining 7000, change 0", () => {
  const result = evaluateCashSettlement("37000", "30000");
  expect(result).toEqual({
    status: "INSUFFICIENT",
    method_code: "CASH",
    amount_due: "37000",
    amount_tendered: "30000",
    remaining_due: "7000",
    change_due: "0",
  });
});

test("UNDER-02: tendered 0 for positive due is INSUFFICIENT, not invalid", () => {
  const result = evaluateCashSettlement("37000", "0");
  expect(result.status).toBe("INSUFFICIENT");
  expect(result.amount_due).toBe("37000");
  expect(result.amount_tendered).toBe("0");
  if (result.status === "INSUFFICIENT") {
    expect(result.remaining_due).toBe("37000");
    expect(result.change_due).toBe("0");
  }
});

test("UNDER-03: INSUFFICIENT result exposes no completed payment_amount", () => {
  const result = evaluateCashSettlement("37000", "30000");
  expect(result.status).toBe("INSUFFICIENT");
  expect("payment_amount" in result).toBe(false);
});

test("NUM-01: amount_due non-string/malformed/negative rejects", () => {
  expect(() => evaluateCashSettlement(100 as any, "100")).toThrowError(
    expect.objectContaining({ code: INVALID_AMOUNT_DUE })
  );
  expect(() => evaluateCashSettlement({}, "100")).toThrowError(
    expect.objectContaining({ code: INVALID_AMOUNT_DUE })
  );
  expect(() => evaluateCashSettlement("invalid", "100")).toThrowError(
    expect.objectContaining({ code: INVALID_AMOUNT_DUE })
  );
  expect(() => evaluateCashSettlement("-100", "100")).toThrowError(
    expect.objectContaining({ code: INVALID_AMOUNT_DUE })
  );
});

test("NUM-02: tendered non-string/malformed/negative rejects", () => {
  expect(() => evaluateCashSettlement("100", 100 as any)).toThrowError(
    expect.objectContaining({ code: INVALID_CASH_TENDER })
  );
  expect(() => evaluateCashSettlement("100", true as any)).toThrowError(
    expect.objectContaining({ code: INVALID_CASH_TENDER })
  );
  expect(() => evaluateCashSettlement("100", "invalid")).toThrowError(
    expect.objectContaining({ code: INVALID_CASH_TENDER })
  );
  expect(() => evaluateCashSettlement("100", "-100")).toThrowError(
    expect.objectContaining({ code: INVALID_CASH_TENDER })
  );
});

test("NUM-03: zero numeric values are valid", () => {
  const result = evaluateCashSettlement("0", "0");
  expect(result.status).toBe("SETTLED");
  if (result.status === "SETTLED") {
    expect(result.payment_amount).toBe("0");
  }
  expect(result.change_due).toBe("0");
});

test("NUM-04: large exact value arithmetic has no floating-point loss", () => {
  const result = evaluateCashSettlement("9999999999999.99", "10000000000000");
  expect(result.status).toBe("SETTLED");
  if (result.status === "SETTLED") {
    expect(result.payment_amount).toBe("9999999999999.99");
    expect(result.change_due).toBe("0.01");
  }
});

test("NUM-05: fractional exact value arithmetic has no floating-point loss", () => {
  const result = evaluateCashSettlement("4.4375", "10");
  expect(result.status).toBe("SETTLED");
  if (result.status === "SETTLED") {
    expect(result.payment_amount).toBe("4.4375");
    expect(result.change_due).toBe("5.5625");
  }
});

test("NUM-06: canonical numeric strings follow @kastur/numeric", () => {
  // Should canonicalize .0000 to pure integer representation
  const result = evaluateCashSettlement("37000.0000", "13000.00");
  expect(result.amount_due).toBe("37000");
  expect(result.amount_tendered).toBe("13000");
});
