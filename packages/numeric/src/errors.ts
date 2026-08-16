export type NumericErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class NumericError extends Error {
  constructor(public readonly code: NumericErrorCode, message: string) {
    super(message);
    this.name = "NumericError";
  }
}

export const ERROR_CODES = {
  INVALID_DECIMAL: "INVALID_DECIMAL",
  DIVISION_BY_ZERO: "DIVISION_BY_ZERO",
  INVALID_SCALE: "INVALID_SCALE",
  INVALID_PRECISION: "INVALID_PRECISION",
  INVALID_ROUNDING_MODE: "INVALID_ROUNDING_MODE",
  DECIMAL_PRECISION_OVERFLOW: "DECIMAL_PRECISION_OVERFLOW"
} as const;
