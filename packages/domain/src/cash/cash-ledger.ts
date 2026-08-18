import { MoneyValue, parseMoney, moneyAdd, moneySubtract, moneyCompare } from "@kastur/numeric";
import { CashMovementType, CashMovementDirection, CashVarianceType, CashMovementDTO } from "@kastur/contracts";

export function getCashMovementDirection(type: CashMovementType): CashMovementDirection {
  switch (type) {
    case "OPENING_BALANCE":
    case "CASH_SALE":
    case "CASH_IN":
      return "IN";
    case "CASH_OUT":
    case "CASH_REFUND":
    case "CASH_REVERSAL":
    case "SAFE_DROP":
      return "OUT";
  }
}

export function calculateExpectedCash(movements: ReadonlyArray<CashMovementDTO>): MoneyValue {
  let expected = parseMoney("0");
  for (const movement of movements) {
    const amount = parseMoney(movement.amount);
    if (movement.direction === "IN") {
      expected = moneyAdd(expected, amount);
    } else {
      expected = moneySubtract(expected, amount);
    }
  }
  return expected;
}

export interface ShiftClosingCalculationResult {
  readonly expected_cash: MoneyValue;
  readonly variance: MoneyValue;
  readonly variance_type: CashVarianceType;
  readonly opening_cash: MoneyValue;
  readonly cash_sales: MoneyValue;
  readonly cash_in: MoneyValue;
  readonly cash_out: MoneyValue;
  readonly cash_refunds: MoneyValue;
}

export function calculateShiftClosing(movements: ReadonlyArray<CashMovementDTO>, actualCash: MoneyValue): ShiftClosingCalculationResult {
  let expected = parseMoney("0");
  let opening = parseMoney("0");
  let sales = parseMoney("0");
  let cashIn = parseMoney("0");
  let cashOut = parseMoney("0");
  let refunds = parseMoney("0");

  for (const movement of movements) {
    const amount = parseMoney(movement.amount);
    if (movement.direction === "IN") {
      expected = moneyAdd(expected, amount);
    } else {
      expected = moneySubtract(expected, amount);
    }

    switch (movement.movement_type) {
      case "OPENING_BALANCE":
        opening = moneyAdd(opening, amount);
        break;
      case "CASH_SALE":
        sales = moneyAdd(sales, amount);
        break;
      case "CASH_IN":
        cashIn = moneyAdd(cashIn, amount);
        break;
      case "CASH_OUT":
      case "SAFE_DROP":
        cashOut = moneyAdd(cashOut, amount);
        break;
      case "CASH_REFUND":
      case "CASH_REVERSAL":
        refunds = moneyAdd(refunds, amount);
        break;
    }
  }

  const variance = moneySubtract(actualCash, expected);
  let varianceType: CashVarianceType = "MATCHED";
  
  const compZero = moneyCompare(variance, parseMoney("0"));
  if (compZero === -1) {
    varianceType = "SHORT";
  } else if (compZero === 1) {
    varianceType = "OVER";
  }

  return {
    expected_cash: expected,
    variance,
    variance_type: varianceType,
    opening_cash: opening,
    cash_sales: sales,
    cash_in: cashIn,
    cash_out: cashOut,
    cash_refunds: refunds,
  };
}

export interface LateEventReconciliationResult {
  readonly new_expected_cash: MoneyValue;
  readonly adjusted_variance: MoneyValue;
  readonly adjusted_variance_type: CashVarianceType;
}

export function calculateLateEventReconciliation(
  originalExpectedCash: MoneyValue,
  actualCash: MoneyValue,
  lateMovement: CashMovementDTO,
): LateEventReconciliationResult {
  const amount = parseMoney(lateMovement.amount);
  const direction = lateMovement.direction;

  let newExpectedCash = originalExpectedCash;
  if (direction === "IN") {
    newExpectedCash = moneyAdd(newExpectedCash, amount);
  } else {
    newExpectedCash = moneySubtract(newExpectedCash, amount);
  }

  const newVariance = moneySubtract(actualCash, newExpectedCash);
  let newVarianceType: CashVarianceType = "MATCHED";

  const compZero = moneyCompare(newVariance, parseMoney("0"));
  if (compZero === -1) {
    newVarianceType = "SHORT";
  } else if (compZero === 1) {
    newVarianceType = "OVER";
  }

  return {
    new_expected_cash: newExpectedCash,
    adjusted_variance: newVariance,
    adjusted_variance_type: newVarianceType,
  };
}
