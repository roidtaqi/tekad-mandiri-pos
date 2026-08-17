import {
  parseMoney,
  moneyCompare,
  moneySubtract,
  type MoneyValue,
} from "@kastur/numeric";
import { PaymentError, INVALID_AMOUNT_DUE, INVALID_CASH_TENDER } from "./payment-errors.js";

export type CashSettlementEvaluation =
  | {
      status: "INSUFFICIENT";
      method_code: "CASH";
      amount_due: MoneyValue;
      amount_tendered: MoneyValue;
      remaining_due: MoneyValue;
      change_due: MoneyValue;
    }
  | {
      status: "SETTLED";
      method_code: "CASH";
      confirmation_type: "CASH_CONFIRMED";
      amount_due: MoneyValue;
      amount_tendered: MoneyValue;
      payment_amount: MoneyValue;
      remaining_due: MoneyValue;
      change_due: MoneyValue;
    };

function validateMoneyInput(value: unknown, errorCode: string, label: string): MoneyValue {
  if (typeof value !== "string") {
    throw new PaymentError(`Invalid ${label}: expected string`, errorCode);
  }
  
  let moneyVal: MoneyValue;
  try {
    moneyVal = parseMoney(value);
  } catch {
    throw new PaymentError(`Invalid ${label}: malformed decimal`, errorCode);
  }

  const zero = parseMoney("0");
  if (moneyCompare(moneyVal, zero) < 0) {
    throw new PaymentError(`Invalid ${label}: negative values not allowed`, errorCode);
  }

  return moneyVal;
}

export function evaluateCashSettlement(amountDue: unknown, amountTendered: unknown): CashSettlementEvaluation {
  const due = validateMoneyInput(amountDue, INVALID_AMOUNT_DUE, "amount_due");
  const tendered = validateMoneyInput(amountTendered, INVALID_CASH_TENDER, "amount_tendered");

  const comparison = moneyCompare(tendered, due);
  const zero = parseMoney("0");

  if (comparison < 0) {
    return {
      status: "INSUFFICIENT",
      method_code: "CASH",
      amount_due: due,
      amount_tendered: tendered,
      remaining_due: moneySubtract(due, tendered),
      change_due: zero,
    };
  } else if (comparison === 0) {
    return {
      status: "SETTLED",
      method_code: "CASH",
      confirmation_type: "CASH_CONFIRMED",
      amount_due: due,
      amount_tendered: tendered,
      payment_amount: due,
      remaining_due: zero,
      change_due: zero,
    };
  } else {
    return {
      status: "SETTLED",
      method_code: "CASH",
      confirmation_type: "CASH_CONFIRMED",
      amount_due: due,
      amount_tendered: tendered,
      payment_amount: due,
      remaining_due: zero,
      change_due: moneySubtract(tendered, due),
    };
  }
}
