# ADR-0008: Shared Decimal / Money / Quantity Primitives

**Status:** Accepted
**Date:** 2026-08-17

## Context
Kastur Retail System requires authoritative math across domains like Pricing, Costing, Cart totals, and Inventory tracking. Using standard IEEE-754 double precision (JavaScript `number`) introduces floating-point errors (e.g. `0.1 + 0.2 != 0.3`). Furthermore, domains scale differently, necessitating high internal precision to delay rounding until explicit quantization.

## Decision
We establish a dedicated `@kastur/numeric` package containing primitive numeric calculation behaviors.

The following rules apply to this numeric package and its usage:
1. **No JavaScript Number:** Authoritative Money/Quantity/Decimal arithmetic does not use JavaScript `number`.
2. **String Values:** API/storage decimal values remain strictly strings.
3. **Single Boundary:** `@kastur/numeric` is the ONLY shared numeric arithmetic boundary.
4. **Internal Engine:** `decimal.js` is the internal engine.
5. **Encapsulation:** Raw Decimal instances/config are not public.
6. **Isolated Construction:** A private cloned Decimal constructor is used.
7. **Guard Precision:** Guard arithmetic precision is 80 significant digits.
8. **Independent Rounding:** Guard rounding is not business rounding.
9. **Strict Inputs:** Public parsers accept string only.
10. **Rejected Inputs:** Scientific notation, NaN, and Infinity are explicitly rejected.
11. **Canonical Forms:** Canonical arithmetic strings use normal base-10 notation.
12. **Semantic Typing:** `MoneyValue` and `QuantityValue` are distinct semantic types (branded strings).
13. **Sign Allowed:** The primitive layer explicitly allows signed values.
14. **No Currency in Money:** Currency context is not embedded in `MoneyValue` in M2-001.
15. **Business Policy separation:** Business/domain sign constraints remain outside the primitive.
16. **Explicit Reduction:** Scale reduction always requires an explicit rounding mode.
17. **Domain Ownership of Rounding:** M7 owns configurable business rounding rules (e.g., NEAREST_100 / UP_TO_1000).
18. **Format Separation:** Display formatting is separate from stored/calculated value.
19. **Legacy Compatibility:** Existing M1 `conversion_factor` wire/cache lexical preservation remains unchanged.
20. **PostgreSQL Compatibility:** No PostgreSQL schema change is required.

## Consequences
By utilizing a shared isolated decimal package and typed, branded primitives, we guarantee mathematically sound floating-point operation free from JS `number` inconsistencies. All consumers will inherently share precision limit standards and predictable scale quantization, lowering the risk of divergent math in POS or Backend services.
