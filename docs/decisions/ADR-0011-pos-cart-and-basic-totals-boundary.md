# ADR-0011: POS Cart and Basic Totals Boundary

## Status

Accepted (M2-005)

## Context

We need an offline-capable Point of Sale (POS) cart to capture cashier actions (scanning products, modifying quantities) before finalizing a transaction. The cart must support robust canonical decimals, strictly respect exact pricing resolved by M2-004, and operate without prematurely writing to database tables.

## Decision

1. **M2-005 Cart is ephemeral DRAFT state:**
   The Cart exists entirely in memory within the POS application session (`usePosCart`). 
   It has no direct integration with Dexie stores and requires no POS schema version bumps (remains at V4).

2. **Cart Context Identity:**
   Lines are uniquely identified by a combination of `[product_unit_id, price_version_id]`.
   - Repeated successful scans of the same Product Unit and Price Version increment the quantity by 1.
   - Different Product Units create separate lines.
   - The same Product Unit under a *different* Price Version creates a separate line, preserving the exact pricing context of the older items.
   - A conflicting unit price for the exact same `[product_unit_id, price_version_id]` rejects with `CART_PRICE_CONTEXT_CONFLICT`.

3. **No Automatic Background Repricing:**
   The `price_version_id` and `unit_price` are captured atomically when the line is added from `ProductLookupResult`.
   No device clock, active timer, or periodic interval will update the unit price or evaluate effective dates while the item sits in the cart.

4. **Robust Decimals (No JS Numbers):**
   - Quantities are strictly stored, merged, and calculated using `QuantityValue` strings from `@kastur/numeric`.
   - Prices and Totals use `MoneyValue` strings.
   - Subtotals and line totals are exact calculations using `moneyAdd` and `multiplyMoneyByQuantity`.
   - Decimal quantities are only accepted if `allow_decimal_qty` is `true`.

5. **No Persistence or Side Effects:**
   Cart operations (`addItem`, `removeLine`, `setLineQuantity`, `clearCart`) MUST NOT create Transactions, Transaction Items, Payments, Stock Movements, Cash Movements, Outbox records, Audit facts, or Sync records. 
   The Cart does not reserve stock or decrement stock balances.

6. **Scope Constraints:**
   - **No Taxes or Discounts:** For M2-005, `grand_total` always equals `gross_subtotal`. No tier, promo, or discount rules apply.
   - **No Payment/Sale Finalization:** Completed Sale integration is reserved for M2-007. Cash payments are M2-006.

## Consequences

- The POS can operate entirely offline with zero latency on Cart modifications.
- Because the Cart is strictly ephemeral, a hard page refresh or crash will drop the ongoing Cart context. (Hold/Resume persistence may be explored in a future milestone but is explicitly excluded from M2-005).
- Future promotions or discounts can be layered onto the `CartTotals` evaluation without rewriting the immutable `line_total` logic for base items.
