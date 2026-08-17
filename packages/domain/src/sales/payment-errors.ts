export const INVALID_AMOUNT_DUE = "INVALID_AMOUNT_DUE";
export const INVALID_CASH_TENDER = "INVALID_CASH_TENDER";

export class PaymentError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "PaymentError";
  }
}
