export class NumericError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "NumericError";
  }
}

export const ERROR_CODES = {
  INVALID_DECIMAL: "INVALID_DECIMAL",
  DIVISION_BY_ZERO: "DIVISION_BY_ZERO",
  INVALID_SCALE: "INVALID_SCALE",
  DECIMAL_PRECISION_OVERFLOW: "DECIMAL_PRECISION_OVERFLOW"
} as const;
