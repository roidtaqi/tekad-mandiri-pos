# ADR-0012: POS Cash Settlement Boundary

## Context
In M2-006, the POS requires the capability to accept physical cash payment while settling a transaction. The previous Cart milestone (M2-005) introduced the authoritative calculation of the Transaction's `grand_total` but lacked any mechanism to evaluate payment. 

A Cashier must type the tendered cash amount while engaging with the customer. During this typing interaction, the system must deterministically evaluate the provided tender against the Cart total.

We must decide the architectural boundary of this cash evaluation. Specifically, we must differentiate between an *ephemeral cash entry state* and the *durable completed business fact* of a finalized sale and drawer cash movement.

## Decision
We establish a pure, ephemeral Cash Settlement domain for evaluating typed cash tender.

The following invariants are locked:

1. **Ephemeral State Only:** M2-006 is solely responsible for Cash Payment entry and evaluation. Evaluating a cash settlement is strictly an in-memory process. 
2. **Payment Entry != Finalization:** Calculating that a cash tender is sufficient does *not* finalize the transaction.
3. **Cash Method Only:** Only physical CASH is supported. There is no split payment or synthetic UUID method identifiers.
4. **Distinct Financial Concepts:**
   - `amount_due`: The target Cart `grand_total` (supplied from M2-005).
   - `amount_tendered`: The raw cash physically presented by the customer.
   - `payment_amount`: The canonical transaction value settled by this method. For a valid single cash settlement, `payment_amount` will never exceed `amount_due`.
   - `change_due`: The physical cash returned to the customer. It is a derived evaluation property.
5. **Change is Derived:** Over-tender creates `change_due`, it does not create extra revenue. Returning change is not modeled as a separate `CASH_OUT` expense.
6. **Underpayment is a State, not an Exception:** Typing a lower `amount_tendered` evaluates as an `INSUFFICIENT` status (with a `remaining_due` value). It does not throw a domain exception since underpayment is a normal UI input phase.
7. **Strict Exact Math:** All mathematics rely purely on `@kastur/numeric` and canonical numeric strings. No JavaScript floating-point numbers are used. There is no commercial rounding applied to the settlement values.
8. **No Infrastructure Effects:** This milestone introduces no Dexie schema bumps, no PostgreSQL migrations, no API endpoints, no outbox writes, and no cash/stock ledger mutations.
9. **Finalization belongs to M2-007:** The M2-007 CompleteSale milestone is strictly responsible for finalizing the transaction, writing the durable POS transaction and payment facts, asserting an active Shift, and producing atomic local database changes.
10. **Full Cash Ledger belongs to M4:** M4 assumes complete authority over full Cash Ledger events and physical cash drawer operations.

## Consequences
- The POS application code (e.g. `useCashPayment` hook) handles real-time UI interactions seamlessly without risk of creating accidental or duplicate transaction records.
- If the underlying Cart is mutated while cash is entered, the evaluation effortlessly updates against the new `amount_due` in memory.
- There is no possibility of floating point precision loss during settlement. 
- M2-007 can accept a clean, verified `payment_amount` value without needing to re-evaluate physical tender mechanics.
