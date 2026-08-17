# ADR-0014: Receipt 80/58 Renderer Boundary

## Status
Accepted

## Context
Kastur Retail System POS needs to render and print receipts for completed sales. The requirements dictate supporting both 80mm and 58mm thermal printers. The receipt is a pure projection derived from the immutable historical `CompletedSaleAggregate`. 
We need to ensure string-safe Indonesian money/qty display, deterministic timestamp presentation, identity-bound presentation context (Business/Location/Cashier), and isolate print failures so they do not invalidate a successful sale transaction.

## Decision

1. **Receipt is a pure projection:** We do not introduce a "Receipt" business table or entity. The receipt is purely a UI rendering derived from a `CompletedSaleAggregate` (from `getCompletedSale()`).
2. **No dynamic lookup:** The receipt uses the historical snapshots of Product name, SKU, price, and quantities embedded in the transaction lines. It does not perform live lookups against the current Product/Price catalog.
3. **Information redaction:** Cost and margin data are never exposed or rendered on the receipt.
4. **Cash semantics:** The receipt must clearly distinguish between total amount, cash tendered (payment amount != cash tender), and change amount.
5. **Print failure isolation:** Any browser-level `window.print()` failure or rejection must be isolated in the UI layer. It must never cause a rollback or invalidation of the underlying `CompleteSale` transaction, as the transaction is already durably committed locally.
6. **Formatting precision:** All money and quantities are displayed safely using Indonesian locales without implicit IEEE-754 rounding.
7. **Responsive sizing:** The receipt component handles CSS scaling or layout rules to target `w-[80mm]` or `w-[58mm]` thermal roll widths seamlessly, driven by printer preferences or styles.

## Consequences
- The local database schema (V5) remains unchanged because receipt data is completely derivable.
- The `CompletedSaleAggregate` boundary is strongly verified.
- The POS application maintains clear separation between business commit logic and presentation output.
- Print exceptions are handled purely visually, fulfilling the offline transaction completion requirement.
