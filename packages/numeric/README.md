# `@kastur/numeric`

This package provides authoritative shared decimal, money, and quantity primitives for the Kastur Retail System.

## Why JS Number is Forbidden for Authoritative Values

JavaScript uses IEEE 754 double-precision floating-point numbers. This causes well-known inaccuracies in decimal arithmetic:
- `0.1 + 0.2` becomes `0.30000000000000004`
- Very large integer values lose precision above `Number.MAX_SAFE_INTEGER`.

Because the Kastur system handles highly precise cost, pricing, inventory quantity, and monetary amounts, all authoritative math must use exact decimal arithmetic. **Do not use JavaScript `number` for authoritative domain math.**

## Policy Overview

1. **Internal Engine:** This package uses `decimal.js` internally. `decimal.js` is kept strictly private to this package. Do not export its constructor or instances.
2. **String Inputs/Outputs:** All public constructors and serialization boundaries deal strictly with strings. `parseDecimal(0.1)` is blocked at both compile-time and runtime.
3. **Canonical Representation:** `parseDecimal` creates a normalized canonical string. `"-0"`, `"0.000"`, and `"001.25"` all normalize strictly. Exponent notation (e.g. `1e3`) is rejected.
4. **Branded Types:** The API distinguishes between `DecimalValue`, `MoneyValue`, and `QuantityValue` using TypeScript semantic branding, while retaining their runtime string nature for serialization/wire efficiency.
5. **Signed Values allowed:** The primitive layer does not reject negative money or negative quantity, because discounts, negative stock adjustments, or refunds are mathematically valid. Specific domains enforce sign policy.
6. **No Implicit Rounding:** Calculations retain high internal precision (80 significant digits). Scale reduction requires explicit rounding mode injection.
7. **Fixed-scale Serialization:** `toFixedScale` converts exact decimals to wire strings representing fixed limits, exactly as required by the database.
8. **M1 Migration Note:** The introduction of this package does **not** automatically mutate M1 wire data strings (like `conversion_factor`) into the canonical format. M1 data format on the wire remains strictly untouched.

## Examples

```ts
import { parseMoney, moneyAdd, moneySubtract } from "@kastur/numeric";

const a = parseMoney("100.50");
const b = parseMoney("200.25");
const total = moneyAdd(a, b); // "300.75"
const change = moneySubtract(total, parseMoney("100")); // "200.75"
```
