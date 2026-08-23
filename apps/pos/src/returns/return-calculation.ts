import {
  decimalAdd,
  decimalCompare,
  decimalDivide,
  decimalMultiply,
  parseDecimal,
  quantizeDecimal,
  type DecimalValue,
} from "@kastur/numeric";

export interface ReturnAmountLine {
  readonly line_total: string;
  readonly maximum_return_quantity?: string;
  readonly sold_quantity: string;
  readonly return_quantity: string;
}

function fixed4(value: DecimalValue): DecimalValue {
  return quantizeDecimal(value, 4, "HALF_UP");
}

export function calculateHistoricalReturnAmount(
  lines: readonly ReturnAmountLine[],
): DecimalValue {
  if (lines.length === 0) throw new Error("Pilih minimal satu item untuk diretur.");
  let total = parseDecimal("0");
  for (const line of lines) {
    const sold = parseDecimal(line.sold_quantity);
    const returned = parseDecimal(line.return_quantity);
    const maximum = parseDecimal(line.maximum_return_quantity ?? line.sold_quantity);
    if (
      decimalCompare(returned, parseDecimal("0")) <= 0 ||
      decimalCompare(returned, maximum) > 0
    ) {
      throw new Error("Jumlah retur harus lebih dari nol dan tidak melebihi sisa yang dapat diretur.");
    }
    const effectiveUnitPrice = fixed4(decimalDivide(parseDecimal(line.line_total), sold));
    total = decimalAdd(total, fixed4(decimalMultiply(effectiveUnitPrice, returned)));
  }
  return fixed4(total);
}

export function isFullReturn(
  soldLineCount: number,
  lines: readonly Pick<ReturnAmountLine, "sold_quantity" | "return_quantity">[],
): boolean {
  return (
    lines.length === soldLineCount &&
    lines.every(
      (line) =>
        decimalCompare(
          parseDecimal(line.return_quantity),
          parseDecimal(line.sold_quantity),
        ) === 0,
    )
  );
}
