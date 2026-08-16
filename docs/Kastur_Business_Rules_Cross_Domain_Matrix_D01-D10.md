# Kastur Retail System — Business Rules Cross-Domain Matrix
## Domain 01–10 Integration Map

**Status:** Draft for Cross-Domain Review  
**Scope:** Domain 01–10  
**Purpose:** Menyatukan seluruh business rules menjadi event/effect map lintas domain sebelum User Journeys, Information Architecture, System Architecture, Database Schema, dan API/Sync Contract.

---

# 1. Domain Index

| Code | Domain |
|---|---|
| D01 | Product Catalog & Unit Management |
| D02 | Purchasing & Receiving |
| D03 | Costing & Inventory Valuation |
| D04 | Pricing, Margin & Price Governance |
| D05 | Inventory & Stock Control |
| D06 | Sales & POS Transaction |
| D07 | Shift, Cash & Payment Control |
| D08 | Identity, Role, Permission & Audit |
| D09 | Customer, Return & Refund |
| D10 | Offline, Sync & Data Authority |

---

# 2. Cross-Domain Authority Map

| Business Concern | Authoritative Domain | Read/Consume By | Core Rule |
|---|---|---|---|
| Product identity | D01 | D02–D10 | Product ID immutable; SKU/barcode are business identifiers, not PK |
| Product Unit & conversion | D01 | D02, D04, D05, D06, D09 | Inventory normalized to Base Unit; historical conversion snapshot immutable |
| Supplier relationship | D01/D02 | D03, Reporting | Supplier can affect purchasing/cost, not target margin hierarchy |
| Purchase commercial facts | D02 | D03, D05, Reporting | Agreed, invoiced, received, accepted, paid are separate facts |
| Inventory quantity | D05 | D02, D03, D06, D09 | Stock Movement Ledger authoritative; balance is projection |
| Inventory valuation | D03 | D05, D06, Reporting | Moving Weighted Average |
| Pricing Reference Cost | D03 | D04 | Latest Valid Landed / Replacement Cost |
| Selling price policy | D04 | D06, Reporting | Versioned, governed, effective-date based |
| Published price | D04 | D06/D10 | Cloud-authoritative; POS consumes published cached versions |
| Sale transaction | D06 | D03, D05, D07, D09 | Completed transaction immutable; correction via new events |
| Payment | D06/D07 | D09, Reporting | Payment records explicit; reversal instead of overwrite |
| Physical cash drawer | D07 | D06, D09 | Cash event ledger authoritative; expected cash derived |
| Shift | D07 | D06, D09 | Operational accountability boundary |
| User identity | D08 | All | One unique operator identity across ecosystem |
| Authorization | D08 | All | Role = preset; Permission = actual authority |
| Audit | D08 | All | Cross-workspace append-only business audit |
| Customer Return | D09 | D03, D05, D07 | New event linked to original sale; original transaction unchanged |
| Refund | D09/D07 | D06, Reporting | New financial event linked to original payment/return |
| Sync state | D10 | All | Separate from business status |
| Shared master data sync | D10 | D01, D02, D04, D08 | Cloud authoritative; clients cache/version |
| Transactional event sync | D10 | D05–D09 | Locally valid once committed; synced idempotently |

---

# 3. Cross-Domain Non-Negotiable Invariants

1. **Tidak ada silent overwrite** untuk stock, cost, active price, completed sale, payment, return, refund, shift close, atau audit.
2. **Business Status ≠ Sync Status.**
3. **Role menentukan job context; Permission menentukan authority.**
4. **Stock Movement Ledger authoritative; Stock Balance hanya projection.**
5. **Cash Ledger authoritative untuk physical drawer; Expected Cash hanya projection.**
6. **Inventory valuation memakai MWA; pricing memakai Latest Valid Landed/Replacement Cost.**
7. **Selling price selalu versioned dan effective-date based.**
8. **POS tidak menentukan margin, cost, atau approval policy.**
9. **Completed transaction menyimpan Product/Unit/Pricing/Cost snapshot.**
10. **Customer Return dan Refund adalah event baru, bukan edit original Sale.**
11. **Semua transaksi/movement offline memakai stable global IDs dan idempotent sync.**
12. **Cloud authoritative untuk shared master, permissions, settings, dan published pricing.**
13. **Physical reality event tidak dihapus karena sync conflict; direkonsiliasi.**
14. **Correction menggunakan reversal/correction/reconciliation event.**
15. **High-risk override selalu explicit + reason + audit.**

---

# 4. Event Matrix Legend

Notation yang digunakan di kolom domain:

```text
C   = Creates authoritative record/event
U   = Updates mutable master/state through controlled versioning
R   = Reads/consumes
P   = Creates/updates projection
A   = Audit/security effect
X   = No direct effect
!   = Exception/review may be generated
```

---

# 5. Group A — Product & Catalog Events

## A01 — Product Created

| Dimension | Rule |
|---|---|
| Trigger | Owner/Admin creates Product |
| Preconditions | `product.create`; SKU valid/unique if provided |
| Source Domain | D01 |
| D01 | **C** Product, base unit, optional initial Product Unit |
| D02 | R later for purchasing |
| D03 | X until opening cost/purchase |
| D04 | X until pricing configured |
| D05 | X until opening stock/movement |
| D06 | R only after sellable Product Unit + published price |
| D07 | X |
| D08 | **A** Product Created |
| D09 | X |
| D10 | **U** master-data sync/version |
| Immutable Records | Product ID |
| Permission | `product.create` |
| Sync | Cloud-authoritative master; offline draft may sync with version checks |
| Exception | Duplicate SKU/barcode |
| Reconciliation | Not normally |

## A02 — Product Unit Added

| Dimension | Rule |
|---|---|
| Trigger | Owner/Admin adds PCS/PACK/CARTON/etc |
| Source | D01 |
| D01 | **C/U** Product Unit + conversion |
| D02 | R for purchasing unit |
| D03 | R conversion for base-unit cost normalization |
| D04 | R as independent pricing scope |
| D05 | R conversion for movement normalization |
| D06 | R as sellable unit |
| D08 | **A** Unit Added |
| D10 | Sync master change |
| Permission | `product.unit.manage` |
| Exception | Invalid conversion; duplicate logical unit |
| Reconciliation | None if no historical event affected |

## A03 — Barcode Added/Changed

| Dimension | Rule |
|---|---|
| Trigger | Owner/Admin manages barcode |
| D01 | **C/U** Barcode linked to Product Unit |
| D06 | R for exact POS lookup |
| D08 | **A** Barcode Changed |
| D10 | Master sync |
| Constraint | Active barcode unique within business |
| Exception | Duplicate barcode |
| Historical Effect | None; transaction snapshots remain unchanged |

## A04 — Product Unit Conversion Changed

| Dimension | Rule |
|---|---|
| Trigger | Authorized catalog edit |
| Preconditions | Existing history may require controlled rule |
| D01 | **U** future conversion only |
| D02 | Future purchase uses new conversion |
| D03 | Future cost normalization uses new conversion |
| D05 | Future movements use new conversion |
| D06 | Future sale uses new conversion |
| D09 | Returns use **original transaction conversion snapshot**, not new conversion |
| D08 | **A** before/after |
| D10 | Versioned master sync |
| Historical Effect | **No retroactive recalculation** |
| Exception | High-risk if Base Unit semantics changed |

## A05 — Product Deactivated

| Dimension | Rule |
|---|---|
| Trigger | Owner/Admin |
| D01 | **U** ACTIVE → INACTIVE |
| D05 | R current stock; warning if stock > 0 |
| D06 | Product cannot be added to new sale |
| D09 | Historical return still allowed |
| D08 | **A** reason if stock exists |
| D10 | Sync master state |
| Exception | Product has stock / active scheduled price |
| Reconciliation | None; historical records remain valid |

## A06 — Opening Product Data Imported

| Dimension | Rule |
|---|---|
| Trigger | Controlled onboarding/import |
| D01 | **C/U** Products/Units/Barcodes |
| D03 | May create INITIAL_COST |
| D04 | May create OPENING_PRICE |
| D05 | May create INITIAL_STOCK |
| D08 | Audit import job + row errors |
| D10 | Bulk sync/bootstrap |
| Core Rule | Legacy spreadsheet maps into Kastur model; it does not define the model |
| Exception | Unknown/duplicate SKU, barcode, unit, invalid qty/cost |
| Reconciliation | Import correction uses explicit events |

---

# 6. Group B — Purchasing & Receiving Events

## B01 — Purchase Draft Created

| Dimension | Rule |
|---|---|
| Trigger | Admin |
| Source | D02 |
| D01 | R Product/Supplier/Unit |
| D02 | **C** Purchase DRAFT + items |
| D03 | No inventory valuation yet |
| D05 | No stock effect |
| D08 | **A** optional meaningful creation |
| D10 | Local draft allowed; sync later |
| Permission | `purchase.create` |
| Exception | Invalid supplier/product/unit |

## B02 — Purchase Ordered / Agreed Snapshot Locked

| Dimension | Rule |
|---|---|
| Trigger | Admin confirms commercial agreement |
| D02 | **C/U** ORDERED + immutable Agreed Purchase Snapshot |
| D03 | Agreed cost may be provisional fallback |
| D04 | No price change |
| D08 | **A** agreement locked |
| D10 | Versioned sync |
| Core Rule | Expected commercial facts are preserved for later comparison |

## B03 — Partial Receipt Accepted

| Dimension | Rule |
|---|---|
| Trigger | Admin physically receives accepted goods |
| Preconditions | `purchase.receive`; valid Product Unit conversion |
| D02 | **C** Receipt + accepted/rejected qty |
| D03 | **C** provisional/final purchase cost event as available |
| D05 | **C** PURCHASE_RECEIPT movement for accepted qty only |
| D04 | May later receive cost-review signal if pricing reference changes |
| D08 | **A** Receiving event |
| D10 | Offline-safe physical event; idempotent sync |
| Immutable | Receipt facts, conversion snapshot |
| Exception | Short/over delivery, wrong unit, damage, duplicate receipt sync |
| Reconciliation | Cost reconciliation if provisional landed cost changes |

## B04 — Final Receipt Completed

| Dimension | Rule |
|---|---|
| Trigger | Remaining goods received |
| D02 | Purchase receiving state → RECEIVED when conditions satisfied |
| D03 | Recalculate final landed basis if full commercial facts available |
| D05 | Additional PURCHASE_RECEIPT movements |
| D08 | Audit |
| D10 | Sync event |
| Core Rule | Each receipt is its own physical event |

## B05 — Purchase Invoice Captured

| Dimension | Rule |
|---|---|
| Trigger | Admin records invoice facts |
| D02 | **U/C** invoice prices, discounts, charges, invoice reference |
| D03 | R for landed cost |
| D08 | Audit sensitive changes |
| D10 | Duplicate invoice check local + server |
| Exception | Agreed vs invoice variance, duplicate/near duplicate invoice, unexpected charge |

## B06 — Purchase Posted

| Dimension | Rule |
|---|---|
| Trigger | Admin |
| Preconditions | Commercial data sufficiently final |
| D02 | **U** → POSTED; commercial record immutable |
| D03 | **C/U** final landed cost + final cost reconciliation if needed |
| D04 | **C** PRICE_REVIEW_RECOMMENDED if margin/cost threshold affected |
| D05 | No duplicate stock movement; receipts already own physical stock effect |
| D08 | **A** Purchase Posted |
| D10 | Idempotent aggregate sync |
| Exception | Integrity warnings may remain OPEN |
| Reconciliation | Cost revaluation if provisional vs final differs |

## B07 — Purchase Corrected After Posting

| Dimension | Rule |
|---|---|
| Trigger | Authorized correction |
| D02 | **C** Purchase Correction event; original untouched |
| D03 | **C** COST_RECONCILIATION |
| D04 | Re-evaluate pricing reference/margin |
| D05 | Inventory movement only if physical quantity correction required |
| D08 | **A** before/after + reason |
| D10 | Idempotent correction sync |
| Permission | `purchase.correct` |
| Exception | Cost already flowed into COGS |
| Reconciliation | May affect remaining inventory + recognized COGS |

## B08 — Bonus / Free Goods Received

| Dimension | Rule |
|---|---|
| D02 | purchased_qty and free_qty stored separately |
| D03 | Total acquisition consideration spread across accepted paid+free quantity |
| D05 | Full accepted physical quantity enters stock |
| D04 | Pricing review based on effective landed cost |
| D08 | Audit via receipt/purchase |
| Core Rule | Free qty changes effective cost, not revenue |

## B09 — Supplier Return Created

| Dimension | Rule |
|---|---|
| Trigger | Admin/authorized user |
| D02 | **C** Supplier Return + claim |
| D03 | Commercial claim uses original receipt landed cost |
| D05 | **C** SUPPLIER_RETURN stock-out |
| D04 | No direct price change; may affect replacement-cost context later |
| D08 | **A** |
| D10 | Idempotent physical/commercial event |
| Exception | Return qty exceeds referenceable qty |
| Reconciliation | Claim settlement may remain outstanding |

## B10 — Supplier Replacement Received

| Dimension | Rule |
|---|---|
| D02 | **C/U** claim settlement = REPLACED |
| D03 | Cost linked to settlement/original claim economics |
| D05 | **C** SUPPLIER_REPLACEMENT stock-in |
| D08 | Audit |
| D10 | Idempotent sync |
| Core Rule | Replacement is not a new paid purchase |

## B11 — Supplier Claim Settlement Updated

| Dimension | Rule |
|---|---|
| D02 | `PENDING_CREDIT → CREDIT_RECEIVED / REPLACED / REFUNDED / WRITTEN_OFF` |
| D03 | Financial/cost effect as applicable |
| D05 | Only physical replacement/return creates stock movement |
| D08 | Audit |
| D10 | Shared state sync |
| Exception | Long-outstanding claim |

## B12 — Purchasing Integrity Anomaly Detected

| Dimension | Rule |
|---|---|
| Trigger | System comparison |
| D02 | **C/P** Integrity status WARNING/REVIEW_REQUIRED |
| D03 | Cost exposure estimate may be calculated |
| D08 | System audit/attention |
| D10 | Exception sync |
| Owner UX | Exception queue |
| Core Rule | Red flag ≠ fraud accusation |

---

# 7. Group C — Costing Events

## C01 — Initial Cost Created

| Dimension | Rule |
|---|---|
| D03 | **C** INITIAL_COST |
| D05 | Pairs with INITIAL_STOCK when applicable |
| D04 | Can be temporary Pricing Reference Cost |
| D08 | Audit |
| D10 | Sync |
| Core Rule | Opening cost is not fake Purchase |

## C02 — Provisional Receipt Cost Applied

| Dimension | Rule |
|---|---|
| D03 | **C** provisional cost status |
| D05 | Inventory quantity already physically received |
| D06 | Sale may use valid current MWA resulting from provisional valuation |
| D08 | Audit Provisional Cost Used |
| D10 | Sync |
| Reconciliation | Required once final landed cost known |

## C03 — Final Landed Cost Calculated

| Dimension | Rule |
|---|---|
| Trigger | Purchase commercial facts finalized |
| D02 | R invoice/discount/freight/tax/bonus data |
| D03 | **C/U** final landed cost + cost history |
| D04 | **C** update Pricing Reference Cost and margin review signal |
| D05 | Inventory value revaluation if provisional differs |
| D08 | Audit |
| D10 | Sync |
| Core Rule | Selling price does not auto-change |

## C04 — Cost Reconciliation

| Dimension | Rule |
|---|---|
| D03 | **C** COST_RECONCILIATION |
| D05 | Inventory value effect; quantity unchanged unless separate movement |
| D06 | Past sale COGS may receive reconciliation effect if applicable |
| D04 | Pricing reference/margin re-evaluation |
| D08 | Audit |
| D10 | Idempotent event |
| Historical Rule | Original provisional values remain visible |

## C05 — Manual Cost Adjustment

| Dimension | Rule |
|---|---|
| Trigger | Authorized exception |
| D03 | **C** MANUAL_COST_ADJUSTMENT |
| D04 | Re-evaluate pricing reference only if adjustment is valid reference source |
| D05 | Inventory value effect as defined; no silent qty change |
| D08 | **A** reason + before/after |
| D10 | Sync |
| Permission | `cost.adjust` |
| Exception | High-risk operation |

## C06 — Negative-Stock Sale COGS Reconciled

| Dimension | Rule |
|---|---|
| Trigger | Future receipt closes unresolved negative consumption |
| D03 | **C** COGS_RECONCILIATION allocated FIFO by transaction time |
| D05 | Receipt already updates quantity ledger |
| D06 | Original sale keeps provisional cost snapshot + reconciliation |
| D08 | Audit |
| D10 | Sync |
| Core Rule | Never use naïve negative MWA |

## C07 — Stock Variance Costed

| Dimension | Rule |
|---|---|
| Trigger | Adjustment/opname |
| D03 | INVENTORY_GAIN / INVENTORY_LOSS valuation at current valid MWA |
| D05 | Corresponding stock movement |
| D08 | Audit |
| D10 | Sync |
| Pricing | No direct pricing reference update |

---

# 8. Group D — Pricing Events

## D01 — Pricing Review Recommended

| Dimension | Rule |
|---|---|
| Trigger | Pricing Reference Cost/margin changes |
| D03 | Provides current Pricing Reference Cost |
| D04 | **C/P** PRICE_REVIEW_RECOMMENDED |
| D06 | No POS change |
| D08 | System event/attention |
| D10 | Sync |
| Core Rule | Alert ≠ Proposal ≠ Active Price |

## D02 — Price Proposal Created

| Dimension | Rule |
|---|---|
| Trigger | Admin |
| D04 | **C** DRAFT proposal / Price Set |
| D03 | R cost/reference |
| D08 | Audit |
| D10 | Offline draft allowed; authoritative sync later |
| Permission | `pricing.proposal.create` |
| POS Effect | None |

## D03 — Price Proposal Submitted for Approval

| Dimension | Rule |
|---|---|
| D04 | lifecycle → PENDING_APPROVAL |
| D08 | Audit proposer/reviewer |
| D10 | Sync shared workflow |
| Authority | Admin may submit; cannot approve own proposal |

## D04 — Price Proposal Approved

| Dimension | Rule |
|---|---|
| Trigger | Owner |
| D04 | **C/U** approved price version/Price Set |
| D03 | Snapshot pricing reference used for decision |
| D08 | Audit original proposal + final approved values |
| D10 | Cloud-authoritative pricing publication workflow |
| POS Effect | None until Effective Date / published version |
| Permission | `pricing.approve` |

## D05 — Owner Direct Price Change

| Dimension | Rule |
|---|---|
| Trigger | Owner |
| D04 | **C** new Price Version |
| D03 | R pricing reference cost |
| D08 | **A** before/after/warnings/reason |
| D10 | Global publication requires authoritative sync |
| Approval | No self-approval needed |
| Historical Rule | Old price version retained |

## D06 — Floor Price Override

| Dimension | Rule |
|---|---|
| Trigger | Owner/authorized override |
| D04 | Price below minimum margin accepted explicitly |
| D08 | **A** required reason |
| D10 | Sync |
| D06 | POS uses published result only |
| Permission | `pricing.override_floor` |

## D07 — Scheduled Price Activated

| Dimension | Rule |
|---|---|
| Trigger | Effective timestamp |
| D04 | SCHEDULED → ACTIVE; prior active → SUPERSEDED |
| D06 | New carts/lines use new version |
| D08 | SYSTEM audit |
| D10 | Published price replicated/cached |
| Offline | Device may activate only if scheduled version already cached |

## D08 — Scheduled Price Replaced Before Activation

| Dimension | Rule |
|---|---|
| D04 | old scheduled → CANCELLED/SUPERSEDED; new version retained |
| D08 | Audit |
| D10 | Versioned sync |
| POS | Must not use cancelled future version |

## D09 — Batch Price Proposal Created

| Dimension | Rule |
|---|---|
| D04 | **C** Batch + item proposals |
| D03 | R multiple cost references |
| D08 | Audit |
| D10 | Sync |
| Owner Review | Approve all/selected/edit/reject selected |
| Core Rule | Item status remains independent |

## D10 — Promotion Activated

| Dimension | Rule |
|---|---|
| D04 | **C/U** Promotion ACTIVE |
| D06 | Price resolution consumes active Promotion |
| D08 | Audit |
| D10 | Cloud published + local cache |
| Inventory | No direct effect |
| Cost | No direct effect |
| Exception | Promo below Floor requires authority |

## D11 — Promotion Ended

| Dimension | Rule |
|---|---|
| D04 | Promotion no longer applicable |
| D06 | New lines revert to base/tier price |
| D08 | Audit/system event |
| D10 | Cache/window evaluation |
| Historical | Past transaction promo snapshot unchanged |

---

# 9. Group E — Inventory Events

## E01 — Initial Stock Posted

| Dimension | Rule |
|---|---|
| D05 | **C** INITIAL_STOCK movement |
| D03 | R/links INITIAL_COST |
| D08 | Audit |
| D10 | Event sync |
| Core Rule | Never fake Purchase |

## E02 — Stock Adjustment Out

| Dimension | Rule |
|---|---|
| Trigger | Admin/Owner |
| D05 | **C** STOCK_ADJUSTMENT_OUT |
| D03 | **C** inventory loss valuation |
| D08 | **A** reason required |
| D10 | Sync |
| Permission | `inventory.adjust` |
| Exception | High-value adjustment attention |

## E03 — Stock Adjustment In

| Dimension | Rule |
|---|---|
| D05 | **C** STOCK_ADJUSTMENT_IN |
| D03 | Inventory gain at valid valuation/fallback |
| D08 | Audit |
| D10 | Sync |
| Rule | Never silent zero-cost economic stock |

## E04 — Stock Opname Started

| Dimension | Rule |
|---|---|
| D05 | **C** OPNAME session DRAFT/COUNTING |
| D08 | Audit |
| D10 | Sync |
| Inventory Balance | No effect yet |

## E05 — Stock Opname Posted — Shortage

| Dimension | Rule |
|---|---|
| D05 | **C** OPNAME_ADJUSTMENT_OUT |
| D03 | INVENTORY_LOSS at current MWA |
| D08 | Audit |
| D10 | Idempotent post |
| Core Rule | Physical count does not overwrite balance |

## E06 — Stock Opname Posted — Surplus

| Dimension | Rule |
|---|---|
| D05 | **C** OPNAME_ADJUSTMENT_IN |
| D03 | INVENTORY_GAIN |
| D08 | Audit |
| D10 | Sync |
| Exception | Missing valid cost basis |

## E07 — Inventory Movement Reversed

| Dimension | Rule |
|---|---|
| D05 | **C** compensating/reversal movement |
| D03 | Matching valuation reversal/correction |
| D08 | **A** reason |
| D10 | Sync |
| Historical | Original movement retained |

## E08 — Product Goes Negative

| Dimension | Rule |
|---|---|
| Trigger | Sale/merged offline events |
| D05 | Balance projection < 0; attention state |
| D03 | Unresolved negative consumption logic |
| D06 | Original sale remains completed |
| D08 | Audit/attention |
| D10 | May arise after multi-device merge |
| Core Rule | Never auto-reset to zero |

## E09 — Low Stock Detected

| Dimension | Rule |
|---|---|
| D05 | **P** LOW_STOCK derived alert |
| D02 | May inform human purchasing decision |
| D08 | No mandatory audit |
| D10 | Projection sync/read |
| Core Rule | Alert does not auto-create Purchase |

---

# 10. Group F — POS & Sales Events

## F01 — Cart Created

| Dimension | Rule |
|---|---|
| D06 | **C** DRAFT cart if persisted |
| D05 | No stock movement/reservation |
| D04 | Price read when lines added |
| D07 | Requires active shift for normal cashier context |
| D08 | User/session context |
| D10 | Local-first |
| Core Rule | Cart ≠ Sale |

## F02 — Product Scanned / Added to Cart

| Dimension | Rule |
|---|---|
| D01 | R Product Unit via barcode |
| D04 | R active base/tier/promo |
| D05 | R local stock estimate |
| D06 | Update cart line |
| D08 | No need to audit every scan |
| D10 | Uses local cache offline |

## F03 — Quantity Changed / Tier Re-evaluated

| Dimension | Rule |
|---|---|
| D04 | Re-resolve same-unit tier |
| D06 | Update line snapshot while Draft |
| D05 | Warning if local availability insufficient |
| D10 | Local computation from cached pricing |
| Historical | Not final until completion |

## F04 — Manual Discount Applied

| Dimension | Rule |
|---|---|
| D04 | Floor/discount policy checked |
| D06 | **U** Draft line/transaction |
| D08 | Audit meaningful discount/override as configured |
| D10 | Offline allowed within cached permission/policy |
| Permission | `discount.apply` |
| Exception | Above limit / below floor |

## F05 — Sale Completed — Cash

| Dimension | Rule |
|---|---|
| D01 | Product/Unit snapshot |
| D03 | **C** COGS snapshot/provisional state |
| D04 | **R/C snapshot** base/tier/promo/discount/version |
| D05 | **C** SALE stock movement per inventory line |
| D06 | **C/U** Transaction → COMPLETED + immutable items/payments |
| D07 | **C** CASH payment + cash ledger effect; shift aggregation |
| D08 | **A** Transaction Completed |
| D09 | Creates future returnable reference |
| D10 | **C** sync aggregate PENDING → SYNCED |
| Atomic Boundary | Transaction + items + payment + COGS + stock + cash + audit + sync queue |
| Permission | `transaction.complete`, `payment.record` |
| Exception | Negative stock warning, stale price/auth possible |

## F06 — Sale Completed — Non-Cash

| Dimension | Rule |
|---|---|
| D03/D04/D05/D06 | Same commercial/inventory effects as normal sale |
| D07 | Payment record; no physical cash drawer increase |
| D10 | Provider capability may require online |
| Exception | Payment PENDING/FAILED |

## F07 — Split Payment Sale Completed

| Dimension | Rule |
|---|---|
| D06 | Transaction has multiple payment records |
| D07 | Cash portion affects drawer; non-cash portions reconcile separately |
| D05 | One sale inventory effect only |
| D10 | All payment records idempotent |
| Invariant | Valid payments settle amount due |

## F08 — Sale Completed with Negative Stock

| Dimension | Rule |
|---|---|
| D05 | SALE movement creates negative balance |
| D03 | Provisional COGS using last-valid MWA |
| D06 | Transaction remains COMPLETED |
| D08 | Negative-stock audit/attention |
| D10 | If offline merge caused it, discrepancy generated |
| Reconciliation | Future receipt triggers COGS reconciliation |

## F09 — Non-Inventory Product Sold

| Dimension | Rule |
|---|---|
| D06 | Completed transaction item |
| D05 | No stock movement |
| D03 | Cost only if product economics configured; no inventory valuation |
| D07 | Payment/cash normal |
| D10 | Sync normal |

## F10 — Draft Cancelled

| Dimension | Rule |
|---|---|
| D06 | DRAFT → CANCELLED or discarded |
| D05 | No inventory effect |
| D07 | No payment/cash effect |
| D08 | Audit only if meaningful persisted draft policy requires |
| D10 | Local state cleanup/sync if persisted |

## F11 — Completed Transaction Voided

| Dimension | Rule |
|---|---|
| Trigger | Authorized supervisor |
| D06 | **C** VOID event; original sale unchanged |
| D05 | **C** compensating inventory movement when stock restored |
| D03 | Reverse/reconcile COGS appropriately |
| D07 | Payment reversal + cash effect if money returned |
| D08 | **A** reason mandatory |
| D09 | Distinct from Customer Return |
| D10 | Idempotent aggregate sync |
| Permission | `transaction.void` |
| Reconciliation | Required if provider reversal async |

## F12 — Receipt Reprinted

| Dimension | Rule |
|---|---|
| D06 | Historical snapshot read |
| D08 | Optional/required audit Receipt Reprinted |
| D10 | No business sync mutation required unless audit synced |
| Other Domains | No commercial/inventory effect |

## F13 — Held Cart Created

| Dimension | Rule |
|---|---|
| D06 | DRAFT/HELD state |
| D05 | No reservation |
| D07 | Must be resolved before shift close under v2 recommendation |
| D10 | Local persistence |
| Core Rule | Held cart is not authoritative sale |

---

# 11. Group G — Shift, Cash & Payment Events

## G01 — Shift Opened

| Dimension | Rule |
|---|---|
| D07 | **C** Shift OPEN + opening cash |
| D06 | Enables Cashier normal sale completion |
| D08 | **A** actor/device/location |
| D10 | Offline-safe event; idempotent sync |
| Core Rule | Opening cash ≠ revenue |

## G02 — Cash In

| Dimension | Rule |
|---|---|
| D07 | **C** CASH_IN event |
| D08 | **A** reason |
| D10 | Sync |
| Revenue | No sales revenue effect |
| Permission | `cash.in` |

## G03 — Cash Out

| Dimension | Rule |
|---|---|
| D07 | **C** CASH_OUT event |
| D08 | **A** reason/actor |
| D10 | Sync |
| Revenue | No sales revenue effect |
| Exception | High-value attention/override |
| Permission | `cash.out` |

## G04 — Safe Drop

| Dimension | Rule |
|---|---|
| D07 | CASH_OUT with SAFE_DROP reason/type |
| D08 | Audit |
| D10 | Sync |
| Accounting Meaning | Not expense; physical drawer reduction only |

## G05 — Payment Corrected

| Dimension | Rule |
|---|---|
| D06/D07 | Original payment reversed + corrected payment created |
| D08 | Audit reason |
| D10 | Idempotent reversal/correction |
| Historical | Original payment retained |
| Example | CASH → QRIS correction |

## G06 — Manual Non-Cash Payment Confirmed

| Dimension | Rule |
|---|---|
| D07 | Payment marked MANUAL_CONFIRMED |
| D08 | Audit |
| D10 | Sync |
| Distinction | Not PROVIDER_VERIFIED |

## G07 — Shift Closing Started

| Dimension | Rule |
|---|---|
| D07 | OPEN → CLOSING |
| D06 | Prevent unresolved PAYMENT_PENDING completion state |
| D08 | Audit |
| D10 | Sync/local state |
| Held Cart | Must be resolved under v2 policy |

## G08 — Shift Closed — Matched

| Dimension | Rule |
|---|---|
| D07 | **C/U** Closing Snapshot; CLOSED; Actual = Expected |
| D08 | Audit |
| D10 | Offline-safe close; sync later |
| Historical | Snapshot immutable |

## G09 — Shift Closed — Short/Over

| Dimension | Rule |
|---|---|
| D07 | Closing snapshot + CASH_SHORT/CASH_OVER |
| D08 | **A** variance reason; review state |
| D10 | Sync |
| Revenue | Sales unchanged |
| Owner | Review exception |

## G10 — Shift Force Closed

| Dimension | Rule |
|---|---|
| D07 | FORCED_CLOSED |
| D08 | **A** supervisor + reason |
| D10 | Sync |
| Actual Cash | Never fabricate; may be UNVERIFIED |
| Permission | `shift.force_close` |

## G11 — Late Event Found After Offline Shift Close

| Dimension | Rule |
|---|---|
| D07 | Original closing snapshot retained |
| D10 | **C** SHIFT_RECONCILIATION_EXCEPTION |
| D08 | Audit/system exception |
| Reporting | Reconciled summary may differ from original close snapshot |
| Core Rule | No silent historical close rewrite |

---

# 12. Group H — Customer Return & Refund Events

## H01 — Return Draft Created

| Dimension | Rule |
|---|---|
| D06 | R original transaction/line |
| D09 | **C** Return DRAFT |
| D05 | No stock effect yet |
| D07 | No payment effect yet |
| D08 | Actor context |
| D10 | Local draft/offline if source transaction cached |

## H02 — Partial Return Completed — RESTOCK

| Dimension | Rule |
|---|---|
| D06 | Original sale unchanged; remaining returnable qty updated as derived state |
| D09 | **C** Return + Return Items |
| D05 | **C** CUSTOMER_RETURN stock-in |
| D03 | **C** cost reversal using original transaction cost snapshot |
| D07 | **C** Refund/payment/cash effect |
| D08 | **A** Return Completed |
| D10 | Atomic idempotent aggregate sync |
| Core Rule | Refund uses historical amount paid |

## H03 — Partial Return Completed — NOT_RESTOCKED

| Dimension | Rule |
|---|---|
| D09 | Return completed |
| D05 | **No sellable stock increase** |
| D03 | Operational loss/write-off treatment |
| D07 | Refund effect |
| D08 | Audit |
| D10 | Sync |

## H04 — Full Return Completed

| Dimension | Rule |
|---|---|
| D09 | All remaining returnable qty completed |
| D06 | Derived commercial state may become REFUNDED_FULL |
| D05 | Restock only according to each line disposition |
| D03 | Cost reversals per line |
| D07 | Refunds |
| D08/D10 | Audit + sync |
| Historical | Original Sale retained |

## H05 — Cash Refund

| Dimension | Rule |
|---|---|
| D09 | Refund COMPLETED |
| D07 | **C** cash refund event; current shift drawer decreases |
| D08 | Audit |
| D10 | Offline-safe if policy allows |
| Historical | Original sale shift unchanged |

## H06 — Non-Cash Refund

| Dimension | Rule |
|---|---|
| D09 | Refund PENDING/COMPLETED |
| D07 | Provider/payment reversal effect; no drawer effect |
| D08 | Audit |
| D10 | Provider may require online |
| Exception | Failed/pending refund queue |

## H07 — Refund Method Override

| Dimension | Rule |
|---|---|
| D09 | Refund method differs from original |
| D07 | Effect follows actual refund method |
| D08 | **A** permission + reason |
| D10 | Sync |
| Permission | `refund.override_method` |

## H08 — Refund Amount Override

| Dimension | Rule |
|---|---|
| D09 | Authorized amount differs from calculated historical refundable amount |
| D07 | Actual financial effect |
| D08 | **A** reason |
| D10 | Sync |
| Permission | `refund.override_amount` |
| Exception | Over-refund protection remains |

## H09 — Outside-Window Return Override

| Dimension | Rule |
|---|---|
| D09 | Return accepted despite policy window |
| D08 | **A** override reason |
| D10 | Sync |
| Permission | `return.override_window` |
| Inventory/Refund | Follow normal completion rules |

## H10 — No-Receipt Return

| Dimension | Rule |
|---|---|
| D09 | **C** HIGH_RISK_RETURN |
| D06 | No authoritative original sale reference available |
| D05 | Inventory effect depends on disposition |
| D03 | Cost basis requires controlled fallback |
| D07 | Refund basis/method controlled |
| D08 | **A** supervisor/Owner reason |
| D10 | Recommended online-required or restricted offline |
| Permission | `return.no_receipt` |
| Owner | Review queue |

## H11 — Return Rejected

| Dimension | Rule |
|---|---|
| D09 | REJECTED return request |
| D05 | No stock effect |
| D03 | No cost effect |
| D07 | No refund |
| D08 | Audit rejection reason |
| D10 | Sync if persisted |

## H12 — Exchange

| Dimension | Rule |
|---|---|
| D09 | Return event |
| D06 | New Sale event |
| D05 | Return movement + new sale movement |
| D03 | Original cost reversal + new sale COGS |
| D07 | Refund/new payment difference |
| D08 | Audit both linked events |
| D10 | Two idempotent aggregates with business linkage |
| Core Rule | Never replace original transaction item |

## H13 — Refund Failed After Return Accepted

| Dimension | Rule |
|---|---|
| D09 | Return accepted; Refund FAILED/PENDING |
| D05 | Physical disposition remains factual |
| D07 | No completed provider refund effect yet |
| D08 | Exception audit |
| D10 | Outstanding refund queue |
| Reconciliation | Required until customer settlement completed |

---

# 13. Group I — Identity, Permission & Audit Events

## I01 — User Created

| Dimension | Rule |
|---|---|
| D08 | **C** User + role assignment |
| D10 | Cloud-authoritative identity sync |
| Other Domains | Future actions use user_id |
| Permission | `user.create` |
| Audit | User Created |

## I02 — Role Assigned / Permission Override Changed

| Dimension | Rule |
|---|---|
| D08 | **U** effective authorization + version |
| D10 | Cloud-authoritative; devices refresh cache |
| Audit | before/after + actor |
| Permission | `role.assign` / `permission.manage` |
| Exception | Cannot eliminate last active Owner |

## I03 — User Deactivated

| Dimension | Rule |
|---|---|
| D08 | ACTIVE → INACTIVE/SUSPENDED |
| D10 | Revoke/refresh sessions when connected |
| D01–D09 | Historical actor references remain |
| Audit | Required |
| Historical | No hard delete |

## I04 — Device Registered

| Dimension | Rule |
|---|---|
| D08 | Device metadata created |
| D10 | Bootstrap/sync identity |
| Audit | Device Registered |
| Core Rule | Device ID ≠ User ID |

## I05 — Device Revoked

| Dimension | Rule |
|---|---|
| D08 | Device → REVOKED |
| D10 | Future sync/auth denied after authoritative state received |
| Historical | Existing events remain |
| Audit | Required |
| Exception | Pending local events require recovery attention |

## I06 — Unauthorized Action Attempt

| Dimension | Rule |
|---|---|
| D08 | Action denied at service boundary |
| D10 | Server revalidates when online |
| Audit | Sensitive/repeated attempts may generate security audit |
| UI | Hiding button alone is insufficient |

## I07 — High-Risk Override Executed

| Dimension | Rule |
|---|---|
| Source | Any domain |
| D08 | **C** high-risk audit with reason |
| D10 | Sync |
| Examples | Floor override, forced close, refund override, cost adjustment |
| Invariant | Owner is never exempt from audit |

---

# 14. Group J — Offline, Sync & Reconciliation Events

## J01 — Offline Sale Completed

| Dimension | Rule |
|---|---|
| D06 | Transaction COMPLETED locally |
| D05 | Local SALE movement |
| D03 | Local COGS snapshot/provisional cost |
| D07 | Local payment/cash effect |
| D08 | Local audit |
| D10 | Sync PENDING |
| Authority | Valid local business fact |
| Reconciliation | Sync later, idempotently |

## J02 — Sync Retry

| Dimension | Rule |
|---|---|
| D10 | Retry same stable event/aggregate |
| D05–D09 | **No duplicate business effects** |
| D08 | Technical retry not new business audit |
| Core Rule | Server-side idempotency mandatory |

## J03 — Stale Pricing Sale Detected

| Dimension | Rule |
|---|---|
| D04 | Server has newer effective published version |
| D06 | Historical sale keeps actual cached price used |
| D08 | System exception/attention |
| D10 | **C** STALE_PRICING_EXCEPTION |
| Reconciliation | Review only; no retroactive repricing |

## J04 — Stale Authorization Detected

| Dimension | Rule |
|---|---|
| D08 | Server authorization newer than cached device context |
| D10 | **C** AUTHORIZATION_STALE_EXCEPTION if relevant |
| Business Event | Preserved if physical/completed event occurred under cached context |
| Future Actions | New authority state applied after refresh |

## J05 — Master Data Version Conflict

| Dimension | Rule |
|---|---|
| Source | D01/D02/D08/Settings |
| D10 | CONFLICT |
| D08 | Resolution audited |
| Rule | No silent same-field last-write-wins |
| Resolution | Show local proposed vs server current |

## J06 — Multi-Device Inventory Merge

| Dimension | Rule |
|---|---|
| D05 | Append all unique Stock Movements |
| D03 | Recompute/reconcile valuation if needed |
| D10 | Merge by event IDs |
| Exception | May create negative stock/discrepancy |
| Rule | Never choose one device’s absolute balance |

## J07 — Duplicate Purchase Invoice Detected After Sync

| Dimension | Rule |
|---|---|
| D02 | PURCHASE_INTEGRITY_EXCEPTION |
| D05 | Physical receipt not deleted |
| D03 | Cost state remains until reviewed/corrected |
| D08 | Attention/audit |
| D10 | Server duplicate detection |
| Reconciliation | Human review required |

## J08 — Return Quantity Conflict After Sync

| Dimension | Rule |
|---|---|
| Trigger | Two devices return overlapping quantity |
| D09 | RETURN_QUANTITY_CONFLICT |
| D05 | Physical movements preserved pending correction |
| D07 | Refund effects may need review |
| D08 | Audit |
| D10 | Conflict queue |
| Reconciliation | Required |

## J09 — Sync Queue Persistence After Restart

| Dimension | Rule |
|---|---|
| D10 | Pending events survive restart |
| Business Domains | Completed records unchanged |
| User Action | No need to repeat business transaction |

## J10 — Local Data Reset Attempt with Pending Events

| Dimension | Rule |
|---|---|
| D10 | Strong warning/block destructive reset |
| D08 | Optional security/diagnostic audit |
| Core Rule | Unsynced completed business facts must be protected |

## J11 — Reporting While Device Has Pending Events

| Dimension | Rule |
|---|---|
| D10 | Server projection may be incomplete |
| Reporting | Show sync completeness warning |
| Owner UX | Pending/offline device visibility |
| Core Rule | Never imply definitive completeness when known unsynced events exist |

---

# 15. Cross-Domain Business Commit Matrix

Business operations yang harus diperlakukan sebagai **one logical aggregate/commit**:

| Business Command | Must Commit Together |
|---|---|
| Complete Sale | Transaction + Items + Pricing Snapshots + Cost Snapshots + Payments + Inventory Movements + Cash effect if applicable + Audit + Sync Queue |
| Complete Return | Return + Return Items + Inventory Effect + Cost Effect + Refund intent/record + Cash/Payment Effect + Audit + Sync Queue |
| Post Purchase | Purchase final state + Final Landed Cost + Cost Reconciliation + Pricing Review signal + Audit + Sync Queue |
| Receive Goods | Receipt + Accepted Qty + Purchase Receipt Stock Movement + Provisional/Final Cost linkage + Audit + Sync Queue |
| Close Shift | Closing Snapshot + Actual Cash + Variance + Review state + Audit + Sync Queue |
| Void Completed Sale | Void Event + Inventory Compensation + Cost Reversal/Reconciliation + Payment Reversal + Cash Effect + Audit + Sync Queue |
| Post Opname | Opname Final Count + Variance + Stock Adjustment + Cost Gain/Loss + Audit + Sync Queue |
| Owner Direct Price Change | Price Version + Validation Result + Override metadata if any + Effective Date + Audit + Publication Sync |

---

# 16. Immutable Record Matrix

| Record/Event | May Edit After Final? | Correction Method |
|---|---:|---|
| Product internal ID | No | Never |
| Historical Product Unit conversion snapshot | No | Future master conversion only |
| Purchase Agreed Snapshot | No | Revision/correction event |
| Receipt | No silent edit | Receipt correction/new event |
| Posted Purchase | No | Purchase Correction |
| Cost Event | No | Cost Reconciliation |
| Stock Movement | No | Reversal/new movement |
| Active/Superseded Price Version | No overwrite | New Price Version |
| Completed Transaction | No | Void/Return/Correction |
| Transaction Item Snapshot | No | Linked correction event |
| Completed Payment | No | Payment Reversal/Correction |
| Closed Shift Snapshot | No | Post-close reconciliation |
| Customer Return | No hard edit after final | Return Reversal/Correction |
| Completed Refund | No | Refund Reversal/Correction |
| Audit Event | No | Never; append follow-up audit |
| Sync Event ID | No | Retry same ID |

---

# 17. Permission-to-Event Matrix

| Event | Default Cashier | Default Admin | Owner |
|---|---:|---:|---:|
| Create Product | No | Yes | Yes |
| Manage Product Unit/Barcode | No | Yes | Yes |
| Create/Receive/Post Purchase | No | Yes | Yes |
| Correct Posted Purchase | No | Permission-controlled | Yes |
| Manual Cost Adjustment | No | Restricted | Yes |
| Create Price Proposal | No | Yes | Yes |
| Approve Price | No | No | Yes |
| Owner Direct Price Change | No | No | Yes |
| Floor Override | No | No | Yes |
| Stock Adjustment | No | Yes | Yes |
| Post Opname | No | Yes | Yes |
| Complete Sale | Yes | Yes if POS access | Yes |
| Apply Discount within limit | Yes | Yes | Yes |
| Void Completed Sale | Restricted/No | Yes if granted | Yes |
| Open/Close Own Shift | Yes | Yes | Yes |
| Force Close Shift | No | Supervisor permission | Yes |
| Cash In | Limited | Yes | Yes |
| Cash Out | Restricted | Yes | Yes |
| Normal Linked Return | Policy-controlled | Yes | Yes |
| No-Receipt Return | No | Restricted | Yes |
| Refund Method/Amount Override | No | Restricted | Yes |
| Manage Users/Roles/Permissions | No | No/default restricted | Yes |
| Resolve Sync/Master Conflict | No | Yes if granted | Yes |
| Read Sensitive Audit | No | Restricted | Yes |

---

# 18. Cross-Domain Snapshot Requirements

## Transaction Item Snapshot

```text
product_id
product_name_snapshot

product_unit_id
unit_name_snapshot
conversion_snapshot

quantity
base_quantity

base_price_snapshot
tier_snapshot
promotion_snapshot
manual_discount_snapshot
final_unit_price_snapshot

cost_snapshot
cost_method/status

tax_snapshot
```

## Purchase / Receipt Snapshot

```text
product_id
product_unit_id
unit_conversion_snapshot

agreed_price
invoice_price
purchased_qty
free_qty
received_qty
accepted_qty

discount_snapshot
tax_snapshot
allocated_acquisition_cost
landed_cost_snapshot
```

## Return Item Snapshot

```text
original_transaction_id
original_transaction_item_id

product_id
product_unit_id
conversion_snapshot

original_sold_qty
previous_returned_qty
return_qty

original_price_snapshot
original_cost_snapshot

return_reason
disposition
refund_basis
```

## Shift Closing Snapshot

```text
opening_cash
cash_sales
cash_in
cash_out
cash_refunds

expected_cash
actual_cash
variance

payment_totals_by_method
transaction_count
void_count
refund_count
override_count
```

---

# 19. Cross-Domain Projection Matrix

| Projection | Built From | Must Be Rebuildable? |
|---|---|---:|
| Stock Balance | Stock Movement Ledger | Yes |
| Inventory Value | Stock + Costing state/events | Yes |
| Product Current Cost View | Cost Events | Yes |
| Current Pricing View | Price Versions + Effective Time | Yes |
| POS Published Price Cache | Cloud Published Pricing | Yes |
| Shift Sales Total | Transactions | Yes |
| Expected Cash | Cash Ledger | Yes |
| Payment Method Totals | Payment Records | Yes |
| Returnable Quantity | Original Sale Qty − Completed Returns | Yes |
| Customer Net Spend | Sales − Refunds | Yes |
| Owner Exception Queue | Integrity/Sync/Pricing/Inventory/Shift/Return signals | Yes |
| Dashboard KPIs | Consolidated authoritative events/projections | Yes |

---

# 20. Cross-Domain Exception Taxonomy

Recommended common exception categories:

```text
PURCHASE_INTEGRITY_EXCEPTION
COST_RECONCILIATION_REQUIRED
PRICE_REVIEW_RECOMMENDED
PRICE_BELOW_FLOOR
INVENTORY_NEGATIVE
INVENTORY_INTEGRITY_EXCEPTION
HIGH_VALUE_ADJUSTMENT
PAYMENT_PENDING
PAYMENT_DUPLICATE_SUSPECTED
CASH_VARIANCE
SHIFT_RECONCILIATION_EXCEPTION
HIGH_RISK_RETURN
REFUND_PENDING
REFUND_DUPLICATE_SUSPECTED
STALE_PRICING_EXCEPTION
AUTHORIZATION_STALE_EXCEPTION
SYNC_CONFLICT
MASTER_VERSION_CONFLICT
RETURN_QUANTITY_CONFLICT
DEVICE_SYNC_HEALTH_WARNING
```

Exception bukan otomatis error fatal. Banyak exception adalah **review signals**.

---

# 21. Cross-Domain Reversal / Correction Matrix

| Original Event | Correct With | Never Do |
|---|---|---|
| Posted Purchase | Purchase Correction | Edit posted row silently |
| Purchase Receipt | Receipt correction / compensating event | Delete receipt |
| Cost Event | Cost Reconciliation | Overwrite cost history |
| Stock Movement | Reversal/compensating movement | Set stock directly |
| Active Price | New Price Version | Edit historical version |
| Completed Sale | Void / Return | Edit/delete transaction |
| Completed Payment | Payment Reversal + corrected payment | Change method field |
| Closed Shift | Reconciliation Adjustment | Rewrite closing snapshot |
| Customer Return | Return Reversal/Correction | Delete completed return |
| Completed Refund | Refund Reversal | Edit settled refund |
| Permission Change | New permission change event | Rewrite audit |
| Audit Event | New follow-up audit | Delete/change old audit |

---

# 22. Cross-Domain Offline Authority Matrix

| Data/Event | Offline Read | Offline Create/Finalize | Global Authority |
|---|---:|---:|---|
| Product Catalog | Yes, cached | Draft/update may be limited | Cloud |
| Product Unit/Barcode | Yes | Back Office draft possible | Cloud |
| Purchase Draft | Yes | Yes | Shared after sync |
| Physical Receiving | Yes | Yes | Event preserved, then shared |
| Final Purchase Posting | Conditional | Yes if local dependencies complete | Shared after sync |
| Cost Calculation | Yes | Yes based on local facts | Reconciled shared state |
| Price Proposal Draft | Yes | Yes | Shared after sync |
| Price Approval/Publication | Cached read | Recommended authoritative sync required | Cloud |
| POS Sale | Yes | Yes | Local fact then shared |
| Stock Movement from Sale | Yes | Yes | Shared event ledger |
| Cash Shift | Yes | Yes | Shared event ledger |
| Normal Cached-Transaction Return | Yes | Yes | Local fact then shared |
| No-Receipt Return | Limited | Recommended online/restricted | Shared |
| Permission Management | Cached read | Recommended online-required | Cloud |
| Audit Event | Yes/local | Yes | Append-only shared |
| Reporting Consolidated | Limited local | N/A | Cloud projection |

---

# 23. Cross-Domain Data Ownership Anti-Patterns

Kastur harus menghindari desain berikut:

```text
POS has its own Product table as independent truth
Back Office has different active price truth
Inventory stored only as product.stock
Cash stored only as shift.expected_cash
Transaction recalculates old price from current catalog
Return overwrites original transaction quantity
Purchase correction overwrites posted invoice
Owner actions skip audit
Sync uses last-write-wins for stock/cash
Offline retry creates duplicate payments
```

---

# 24. Cross-Domain Operational Flows

## Flow 1 — Purchase to Selling Price

```text
D01 Product
↓
D02 Purchase Agreement
↓
D02 Receiving
↓
D05 Stock Movement +
↓
D03 Landed Cost / MWA
↓
D03 Pricing Reference Cost
↓
D04 Margin Re-evaluation
↓
D04 Price Proposal / Owner Direct
↓
D04 Approval + Effective Date
↓
D10 Published Price Sync
↓
D06 POS Uses Price
```

## Flow 2 — Sale to Inventory/Cash

```text
D01 Product Unit
↓
D04 Published Price
↓
D06 Cart
↓
D06 Finalize Sale
├── D03 COGS Snapshot
├── D05 SALE Movement
├── D07 Payment
├── D07 Cash Ledger if CASH
├── D08 Audit
└── D10 Sync Aggregate
```

## Flow 3 — Customer Return

```text
D06 Original Sale
↓
D09 Return
├── Disposition RESTOCK
│     ↓
│   D05 Stock +
│     ↓
│   D03 Original Cost Reversal
│
└── NOT_RESTOCKED
      ↓
    D03 Loss Treatment

D09 Refund
↓
D07 Payment/Cash Effect
↓
D08 Audit
↓
D10 Sync
```

## Flow 4 — Negative Stock

```text
D06 Sale
↓
D05 Stock < 0
↓
D03 Provisional COGS
↓
D08 Attention
↓
Future D02/D05 Receipt
↓
D03 COGS Reconciliation
↓
D10 Shared Reconciliation
```

## Flow 5 — Offline Sale

```text
Cached D01 + D04 + D08
↓
D06 Complete Sale locally
├── D05 local movement
├── D03 cost snapshot
├── D07 payment/cash
├── D08 audit
└── D10 pending aggregate
↓
Reconnect
↓
D10 server idempotency
↓
Shared ledgers/projections updated
```

---

# 25. Preliminary Cross-Domain Gap Candidates

Bagian ini **belum merupakan keputusan final**. Ini adalah kandidat yang harus diperiksa pada tahap berikutnya: **Cross-Domain Gap & Conflict Review**.

## GAP-001 — Post-Completion Void vs Customer Return Boundary

Need to lock:

```text
Kapan completed transaction harus VOID?
Kapan harus RETURN?
Apakah VOID memiliki time-window?
```

Current rule sudah membedakan konsep, tetapi operational policy perlu diperjelas.

## GAP-002 — Payment Correction Authority

Need to lock:

```text
Cashier salah memilih CASH vs QRIS.
Siapa yang boleh melakukan correction?
Dalam shift yang sama saja atau kapan pun?
```

## GAP-003 — Transaction-Level Discount Scope

Need to lock apakah v2 benar-benar menyediakan:

```text
line discount
transaction discount
```

atau hanya line discount pada first implementation.

Schema sudah sebaiknya siap untuk keduanya.

## GAP-004 — Promotion Conflict Priority

Current rule:

```text
one best applicable promotion per line
```

Need deterministic priority definition jika benefit sama / priority sama.

## GAP-005 — No-Receipt Return Refund Basis

Need business-level default:

```text
Current Active Price
Lowest Recent Selling Price
Exchange Only
Manual Supervisor Amount
```

## GAP-006 — Return Window Default

Architecture configurable, tetapi product default perlu dipilih nanti.

## GAP-007 — Offline Owner Direct Price Change

Current recommendation:

```text
may draft offline
global activation requires authoritative sync
```

Need confirm whether v2 UI should completely disable "Activate" offline.

## GAP-008 — Purchase Posting Offline

Need lock whether:

```text
POSTED locally
```

is allowed, or:

```text
POST_PENDING_SYNC
```

must be used for all offline posting.

## GAP-009 — Split Payment MVP

Schema requires multiple payments.

Need decide whether v2 first UI exposes split payment immediately or only keeps schema ready.

## GAP-010 — Cash Drawer vs Terminal Mapping

Current model assumes:

```text
one active cashier shift per drawer/terminal context
```

Need lock first implementation mapping:

```text
device = terminal = drawer
```

or separate `terminal_id` from day one.

## GAP-011 — Customer Domain Depth

Customer is currently optional and lightweight.

Need decide before User Journeys whether MVP includes:

```text
Customer CRUD
phone search
purchase history
```

or only minimal optional identity.

## GAP-012 — Product Base Unit Change Migration

Current rule blocks casual edits.

Need later define the controlled migration procedure before schema/admin UX.

## GAP-013 — Product Deactivation with Scheduled Promotion/Price

Need lock warning/cancellation behavior for:

```text
inactive product
+
future scheduled price/promotion
```

## GAP-014 — Non-Restocked Return Cost Classification

Current rule says operational loss/write-off.

Need define exact reporting categories for:

```text
DAMAGED
EXPIRED
QUALITY_ISSUE
CUSTOMER_GOODWILL
```

## GAP-015 — Stock Opname While POS Continues Selling

Need lock snapshot/counting behavior if sales occur during an open opname session.

This is important for retail operations.

## GAP-016 — Receiving While Opname Open

Need define whether incoming receipts are:

```text
included after count snapshot
excluded
or require recount
```

## GAP-017 — Global Price Effective Time & Device Clock

Scheduled pricing offline depends on local time.

Need architecture rule for:

```text
business timezone
device clock drift
trusted effective-time evaluation
```

## GAP-018 — Sale Completion with Missing Cost

Current invariant says economic product should not silently use cost 0.

Need lock fallback/block behavior when no valid cost exists.

## GAP-019 — Refund Pending but Return Physically Completed

Need UX/status naming for:

```text
Return accepted
Refund pending
```

to avoid cashier/customer confusion.

## GAP-020 — High-Risk Exception Escalation

Need common Owner Attention severity:

```text
INFO
WARNING
REVIEW_REQUIRED
CRITICAL
```

or equivalent.

---

# 26. Cross-Domain Review Checklist

Sebelum masuk User Journeys, setiap event penting harus lolos checklist berikut:

```text
[ ] Source Domain jelas
[ ] Actor/Permission jelas
[ ] Preconditions jelas
[ ] Authoritative record jelas
[ ] Inventory effect jelas
[ ] Cost effect jelas
[ ] Pricing effect jelas
[ ] Payment/Cash effect jelas
[ ] Historical snapshot jelas
[ ] Audit effect jelas
[ ] Offline capability jelas
[ ] Idempotency jelas
[ ] Reversal/correction jelas
[ ] Exception path jelas
[ ] Reconciliation path jelas
[ ] Projection/reporting impact jelas
```

---

# 27. Final Cross-Domain Invariant

> **Setiap kejadian bisnis di Kastur harus mempunyai satu source domain yang jelas, menghasilkan efek lintas domain yang deterministik, meninggalkan historical trace yang immutable, menggunakan permission yang eksplisit, dan tetap dapat direkonsiliasi ketika terjadi offline operation, retry, correction, atau conflict. Tidak boleh ada domain yang menyimpan duplicate canonical truth untuk Product, Price, Inventory, Cash, Transaction, atau Identity.**

---

# 28. Recommended Next Step

Setelah matrix ini disetujui:

```text
Business Rules Domain 01–10
        ↓
Cross-Domain Matrix
        ↓
CROSS-DOMAIN GAP & CONFLICT REVIEW
        ↓
Resolve GAP-001 ... GAP-020
        ↓
User Journeys / Operational Flows
        ↓
Information Architecture
        ↓
System Architecture
        ↓
Database / Domain Schema
        ↓
API + Sync Contract
        ↓
Design System
        ↓
Screen Specifications
        ↓
Legacy Code KEEP / ADAPT / REPLACE / REMOVE
        ↓
Implementation Roadmap
```
