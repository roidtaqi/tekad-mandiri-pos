# Kastur Retail System — API & Sync Contract v1

**Status:** Draft for Contract Review  
**Style:** JSON HTTP API + Incremental Sync  
**Depends on:** System Architecture v1 + Database & Domain Schema v1  
**Applies to:** Kastur Back Office, Kastur POS, Kastur API/Sync Platform  
**Purpose:** Menetapkan kontrak komunikasi yang stabil antara client offline-first dan canonical cloud platform sebelum Design System, Screen Specifications, legacy migration, dan implementation.

---

# 1. Contract Goals

API/Sync Contract harus memastikan:

1. Business commands tetap deterministik.
2. Offline retry tidak menciptakan duplicate business effects.
3. Client tidak mengirim arbitrary table mutations.
4. Server tetap authoritative untuk permissions, shared master data, dan published pricing.
5. Offline-completed physical/business events dapat diterima dan direkonsiliasi tanpa dihapus.
6. Mutable master conflicts tidak silently overwrite.
7. Business Status dan Sync Status tetap terpisah.
8. API DTO tidak bergantung langsung pada internal database row shape.
9. API versioning dan client compatibility explicit.
10. POS tidak membutuhkan cloud round-trip untuk normal cash sale.

---

# 2. Transport

Primary transport:

```text
HTTPS
JSON
UTF-8
```

Optional acceleration:

```text
WebSocket
```

WebSocket hanya untuk notification/invalidation.

Canonical data mutation tetap melalui authenticated HTTP command/sync API.

---

# 3. Base API Shape

Conceptual:

```text
/api/v1/
├── auth/
├── commands/
├── queries/
├── sync/
└── system/
```

Exact reverse-proxy/domain path dapat berubah tanpa mengubah logical contract.

---

# 4. Required Client Headers

Recommended:

```http
X-Kastur-Client: pos | backoffice
X-Kastur-Client-Version: 2.0.0
X-Kastur-Schema-Version: 1
X-Kastur-Device-Id: <uuid>
X-Request-Id: <uuid>
```

For idempotent commands:

```http
Idempotency-Key: <stable-key>
```

Authentication:

```http
Authorization: Bearer <session-token>
```

or secure session cookie equivalent.

Exact auth transport may change, but server must derive authenticated User/Business context from session.

---

# 5. Never Trust `business_id` from Client as Authority

Client payload may include:

```text
business_id
```

for offline provenance/debugging if useful.

But authoritative scope is derived from:

```text
Authenticated Session
→ Business Membership
→ Active Business Context
```

Server rejects cross-business attempts.

---

# 6. Location Scope

Client sends explicit:

```json
{
  "location_id": "..."
}
```

only for operational commands where location matters.

v2 normal clients usually use cached default Location.

Server verifies membership/policy scope.

---

# 7. Command Envelope

All write commands use a consistent logical envelope.

```json
{
  "command_id": "uuid",
  "command_type": "sales.complete",
  "schema_version": 1,
  "occurred_at": "2026-08-16T12:30:00+08:00",
  "location_id": "uuid",
  "device_id": "uuid",
  "authorization_version": 42,
  "correlation_id": "uuid",
  "payload": {}
}
```

Rules:

```text
command_id
→ globally unique
→ stable across retry

command_type
→ stable contract identifier

occurred_at
→ business occurrence time

authorization_version
→ permission snapshot used client-side

correlation_id
→ connects multi-domain operation
```

---

# 8. HTTP Idempotency Contract

For commands that create durable business effects:

```text
Idempotency-Key MUST be stable across retries.
```

Recommended:

```text
Idempotency-Key = command_id
```

Server uniqueness scope:

```text
business_id + command_type + idempotency_key
```

If same key + same request payload:

```text
return prior result
```

If same key + materially different payload:

```text
IDEMPOTENCY_KEY_REUSE_ERROR
```

---

# 9. Command Result Envelope

Success:

```json
{
  "request_id": "uuid",
  "command_id": "uuid",
  "status": "ACCEPTED",
  "result": {
    "entity_type": "transaction",
    "entity_id": "uuid"
  },
  "warnings": [],
  "server_time": "2026-08-16T05:00:00Z",
  "change_cursor": 123456
}
```

Accepted with review:

```json
{
  "status": "ACCEPTED_WITH_REVIEW",
  "result": {},
  "warnings": [
    {
      "code": "STALE_PRICING_EXCEPTION",
      "severity": "WARNING"
    }
  ]
}
```

---

# 10. Command Outcome Classification

Stable command outcomes:

```text
ACCEPTED
ACCEPTED_WITH_REVIEW
REJECTED_VALIDATION
REJECTED_PERMISSION
REJECTED_CONFLICT
REJECTED_ONLINE_REQUIRED
REJECTED_RETRYABLE
REJECTED_FINAL
```

Meaning:

## ACCEPTED

Command committed exactly once.

## ACCEPTED_WITH_REVIEW

Business event committed, but exception/reconciliation item created.

Typical:

```text
STALE_PRICING
AUTHORIZATION_STALE
NEGATIVE_STOCK_AFTER_MERGE
```

## REJECTED_VALIDATION

Payload/business precondition invalid.

## REJECTED_PERMISSION

Current authoritative permission does not permit action.

## REJECTED_CONFLICT

Mutable version/semantic conflict requires resolution.

## REJECTED_ONLINE_REQUIRED

Action may not be finalized from offline state.

## REJECTED_RETRYABLE

Temporary server/provider failure.

## REJECTED_FINAL

Command cannot be retried unchanged.

---

# 11. HTTP Status Mapping

Recommended:

```text
200  Accepted / idempotent prior result
201  Created
202  Async provider flow started
400  Malformed request
401  Unauthenticated
403  Permission denied
404  Entity not found in scoped business
409  Version/business conflict
422  Business validation failed
426  Client update required
429  Rate limited
503  Temporary unavailable
```

Business outcome remains explicit in JSON body.

---

# 12. Error Envelope

```json
{
  "request_id": "uuid",
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "The record changed before your update was applied.",
    "retryable": false,
    "details": {},
    "field_errors": []
  },
  "server_time": "2026-08-16T05:00:00Z"
}
```

UI copy may be localized separately.

Do not use raw exception messages as user-facing business text.

---

# 13. Stable Error Code Registry

Core:

```text
UNAUTHENTICATED
PERMISSION_DENIED
ENTITY_NOT_FOUND
VALIDATION_ERROR
VERSION_CONFLICT
IDEMPOTENCY_KEY_REUSE_ERROR
ONLINE_REQUIRED
CLIENT_UPDATE_REQUIRED
SCHEMA_VERSION_UNSUPPORTED
DEVICE_REVOKED
BUSINESS_INACTIVE
LOCATION_INACTIVE
```

Catalog:

```text
SKU_ALREADY_EXISTS
BARCODE_ALREADY_EXISTS
BASE_UNIT_LOCKED
INVALID_UNIT_CONVERSION
PRODUCT_INACTIVE
PRODUCT_UNIT_NOT_SELLABLE
PRODUCT_UNIT_NOT_PURCHASABLE
```

Purchasing:

```text
PURCHASE_NOT_EDITABLE
PURCHASE_NOT_READY_TO_POST
PURCHASE_ALREADY_POSTED
RECEIPT_QTY_INVALID
SUPPLIER_RETURN_QTY_EXCEEDED
DUPLICATE_INVOICE_SUSPECTED
```

Pricing:

```text
PRICE_BELOW_FLOOR
PRICE_VERSION_OVERLAP
PRICE_PROPOSAL_NOT_APPROVABLE
PRICE_ALREADY_SUPERSEDED
CLOCK_UNTRUSTED
```

Inventory:

```text
INVENTORY_ADJUST_PERMISSION_REQUIRED
OPNAME_ALREADY_POSTED
OPNAME_RECOUNT_RECOMMENDED
```

Sales:

```text
SHIFT_REQUIRED
SHIFT_CLOSED
PAYMENT_INSUFFICIENT
PAYMENT_OVERSETTLED
PAYMENT_METHOD_OFFLINE_UNAVAILABLE
TRANSACTION_ALREADY_COMPLETED
TRANSACTION_NOT_VOIDABLE
```

Return/Refund:

```text
RETURN_QTY_EXCEEDED
RETURN_WINDOW_EXPIRED
NO_RECEIPT_PERMISSION_REQUIRED
REFUND_AMOUNT_EXCEEDED
REFUND_METHOD_OVERRIDE_REQUIRED
REFUND_PROVIDER_FAILED
```

Sync:

```text
SYNC_CURSOR_INVALID
SYNC_CONFLICT
STALE_PRICING_EXCEPTION
AUTHORIZATION_STALE_EXCEPTION
RETURN_QUANTITY_CONFLICT
SHIFT_RECONCILIATION_EXCEPTION
```

---

# 14. Optimistic Concurrency Contract

Mutable master command includes:

```json
{
  "expected_version": 7
}
```

Server compares with current:

```text
current version = 8
```

Response:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "details": {
      "entity_id": "...",
      "expected_version": 7,
      "server_version": 8
    }
  }
}
```

Client must not silently overwrite.

---

# 15. Query Response Envelope

Recommended:

```json
{
  "data": {},
  "meta": {
    "server_time": "...",
    "request_id": "..."
  }
}
```

List:

```json
{
  "data": [],
  "page": {
    "next_cursor": "opaque",
    "has_more": true
  },
  "meta": {}
}
```

---

# 16. Query Pagination

Prefer cursor-based pagination for large operational histories.

Examples:

```text
Transactions
Stock Movements
Audit
Cost History
Purchases
```

Small master lists may support offset/page if simpler, but contract should favor cursor consistency.

---

# 17. Query Sorting

Server exposes explicit sort keys.

Example:

```text
occurred_at_desc
created_at_desc
name_asc
status_then_date
```

Do not accept arbitrary SQL field names from client.

---

# 18. Query Filtering

Filters use stable business parameters.

Example:

```http
GET /api/v1/queries/transactions?status=COMPLETED&from=...&to=...
```

Server validates allowed filter values.

---

# 19. Bootstrap Contract

Endpoint:

```http
GET /api/v1/sync/bootstrap
```

Purpose:

```text
Prepare a device for offline operation without replaying all history.
```

Request headers identify:

```text
client type
device
client version
schema version
```

---

# 20. Bootstrap Response

Conceptual:

```json
{
  "bootstrap_version": 1,
  "server_time": "...",
  "business": {},
  "location": {},
  "terminal": {},
  "authorization": {},
  "settings": {},
  "products": [],
  "product_units": [],
  "barcodes": [],
  "published_price_versions": [],
  "published_price_tiers": [],
  "promotions": [],
  "payment_methods": [],
  "stock_balances": [],
  "sync_cursor": 123456
}
```

POS bootstrap includes only data necessary for POS/offline operation.

Back Office bootstrap can use a different projection set.

---

# 21. Bootstrap Atomicity

Server should establish snapshot consistency around:

```text
bootstrap snapshot
+
returned sync_cursor
```

so that changes occurring during bootstrap are not lost.

Implementation may use DB transaction/snapshot strategy.

---

# 22. Sync Pull Contract

Endpoint:

```http
GET /api/v1/sync/pull?cursor=123456&limit=500
```

Response:

```json
{
  "changes": [
    {
      "sequence": 123457,
      "entity_type": "product",
      "entity_id": "uuid",
      "change_type": "UPSERT",
      "entity_version": 9,
      "occurred_at": "...",
      "payload": {}
    }
  ],
  "next_cursor": 123457,
  "has_more": false,
  "server_time": "..."
}
```

---

# 23. Sync Cursor Rules

Cursor is:

```text
server-issued monotonic sequence
```

Not:

```text
client timestamp
```

Client only advances local cursor after all changes in response are applied successfully in one local transaction.

---

# 24. Pull Change Types

Stable categories:

```text
UPSERT
DEACTIVATE
EVENT
INVALIDATE
```

Examples:

```text
Product updated
→ UPSERT

Product deactivated
→ DEACTIVATE

Price published
→ UPSERT / EVENT

Permission changed
→ INVALIDATE authorization
```

---

# 25. Sync Push Contract

Endpoint:

```http
POST /api/v1/sync/push
```

Request:

```json
{
  "batch_id": "uuid",
  "client_schema_version": 1,
  "commands": [
    {
      "command_id": "uuid",
      "command_type": "sales.complete",
      "occurred_at": "...",
      "location_id": "uuid",
      "device_id": "uuid",
      "authorization_version": 42,
      "correlation_id": "uuid",
      "payload": {}
    }
  ]
}
```

---

# 26. Push Batch Semantics

Batch is transport batching, not one giant business transaction.

Each command:

```text
independently idempotent
```

Server may accept command 1 and reject command 2.

But each accepted command must be internally atomic.

---

# 27. Push Response

```json
{
  "batch_id": "uuid",
  "results": [
    {
      "command_id": "uuid",
      "status": "ACCEPTED",
      "result": {}
    },
    {
      "command_id": "uuid",
      "status": "REJECTED_CONFLICT",
      "error": {}
    }
  ],
  "latest_cursor": 123500,
  "server_time": "..."
}
```

Client removes outbox entry only when command is definitively accepted or intentionally resolved.

---

# 28. Retry Rules

Retry unchanged:

```text
REJECTED_RETRYABLE
network timeout
server 503
unknown response after request transmission
```

Do not automatically retry unchanged forever:

```text
REJECTED_VALIDATION
REJECTED_CONFLICT
REJECTED_PERMISSION
REJECTED_FINAL
```

These enter review/recovery flow.

---

# 29. Unknown Commit Result

If client sent command but connection dropped before receiving result:

```text
retry same command_id / Idempotency-Key
```

Server returns prior committed result if already applied.

This is the primary reason idempotency is mandatory.

---

# 30. WebSocket Notification Contract

Optional connection:

```text
wss://.../api/v1/notifications
```

Messages:

```json
{
  "type": "SYNC_AVAILABLE",
  "business_id": "...",
  "hint_sequence": 123500
}
```

Other possible types:

```text
PRICE_PUBLISHED
PERMISSION_CHANGED
DEVICE_REVOKED
```

Payload never replaces pull API.

---

# 31. Authentication Contract Requirements

Exact auth provider deferred.

Required capabilities:

```text
login
logout
session refresh
session revoke
device-aware session
password/PIN secret not exposed
offline authorization snapshot
```

---

# 32. Auth Context Response

Conceptual:

```json
{
  "user": {
    "id": "uuid",
    "display_name": "..."
  },
  "membership": {
    "business_id": "uuid",
    "status": "ACTIVE"
  },
  "primary_role": "CASHIER",
  "permissions": [
    "pos.use",
    "transaction.complete"
  ],
  "authorization_version": 42,
  "offline_valid_until": "...",
  "default_location_id": "uuid"
}
```

---

# 33. Permission Validation

Every command handler performs:

```text
authenticated session
→ membership active
→ device state
→ permission
→ business preconditions
```

Client-side permission controls UI only.

---

# 34. Stale Authorization During Offline Sync

If business event occurred offline using authorization version 41 but server is now version 42:

Server evaluates event class.

For valid physical/completed business facts, server may:

```text
ACCEPTED_WITH_REVIEW
+
AUTHORIZATION_STALE_EXCEPTION
```

rather than deleting historical reality.

For mutable/sensitive non-physical commands:

```text
REJECTED_PERMISSION
```

is usually appropriate.

---

# 35. Device Revocation

If device is currently revoked:

New cloud commands:

```text
REJECTED_PERMISSION / DEVICE_REVOKED
```

Previously committed local business facts require a controlled recovery/import path rather than silent data loss.

---

# 36. Trusted Time Contract

Bootstrap/auth/sync responses include:

```text
server_time
```

Client records local receipt time and calculates estimated offset.

Client submits:

```text
occurred_at
```

for offline events.

Server also stores:

```text
recorded_at
```

independently.

---

# 37. Scheduled Price Time Contract

Price publication/effective schedule is server authoritative.

Offline POS may use cached scheduled version only if local trusted-time state is valid.

If not:

```text
use last-known active price
+
mark CLOCK_UNTRUSTED / review warning
```

---

# 38. Product Commands

## `catalog.product.create`

Permission:

```text
product.create
```

Payload:

```json
{
  "product_id": "uuid",
  "sku": "SKU-001",
  "name": "Indomie Goreng",
  "category_id": "uuid",
  "brand_id": "uuid",
  "base_unit_code": "PCS",
  "track_inventory": true
}
```

Result:

```json
{
  "product_id": "uuid",
  "version": 1
}
```

---

# 39. Product Update

Command:

```text
catalog.product.update
```

Payload:

```json
{
  "product_id": "uuid",
  "expected_version": 3,
  "changes": {
    "name": "...",
    "category_id": "..."
  }
}
```

Base Unit update uses dedicated guarded command rather than generic free-form change if history exists.

---

# 40. Product Unit Create

Command:

```text
catalog.product_unit.create
```

Payload:

```json
{
  "product_unit_id": "uuid",
  "product_id": "uuid",
  "unit_code": "CTN",
  "display_name": "Carton",
  "conversion_factor": "48",
  "can_sell": true,
  "can_purchase": true,
  "allow_decimal_qty": false
}
```

Decimal values travel as strings.

---

# 41. Decimal Serialization Rule

All authoritative Decimal/Money/Quantity values should be serialized as JSON strings:

```json
{
  "amount": "12500.0000",
  "quantity": "1.500000",
  "margin": "0.20000000"
}
```

Never rely on binary JS number for authoritative calculations.

---

# 42. Barcode Create

Command:

```text
catalog.barcode.create
```

Errors:

```text
BARCODE_ALREADY_EXISTS
```

Payload binds Barcode to Product Unit.

---

# 43. Purchase Draft Create

Command:

```text
purchasing.purchase.create
```

Offline capability:

```text
LOCAL_DRAFT_ONLY / syncable
```

Payload includes:

```text
purchase_id
purchase_number
supplier_id
purchase_date
items
notes
```

---

# 44. Mark Purchase Ordered

Command:

```text
purchasing.purchase.mark_ordered
```

Creates locked Agreed Purchase Snapshot.

Payload:

```json
{
  "purchase_id": "uuid",
  "expected_version": 5
}
```

---

# 45. Receive Goods Command

Command:

```text
purchasing.receive_goods
```

Offline-safe.

Payload:

```json
{
  "receipt_id": "uuid",
  "receipt_number": "RCV-...",
  "purchase_id": "uuid",
  "received_at": "...",
  "items": [
    {
      "receipt_item_id": "uuid",
      "purchase_item_id": "uuid",
      "product_id": "uuid",
      "product_unit_id": "uuid",
      "conversion_snapshot": "48.00000000",
      "received_qty": "5.000000",
      "accepted_qty": "5.000000",
      "rejected_qty": "0.000000",
      "free_qty_received": "1.000000"
    }
  ]
}
```

Server recomputes:

```text
base_qty_accepted
```

---

# 46. Receive Goods Result

```json
{
  "receipt_id": "uuid",
  "purchase_status": "PARTIALLY_RECEIVED",
  "stock_movements": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "base_quantity_delta": "240.000000"
    }
  ],
  "warnings": []
}
```

Possible:

```text
ACCEPTED_WITH_REVIEW
SHORT_DELIVERY
OVER_DELIVERY
BONUS_VARIANCE
```

as warnings/exceptions.

---

# 47. Capture Purchase Invoice

Command:

```text
purchasing.invoice.upsert
```

Mutable until Purchase POSTED.

Requires:

```text
expected purchase/invoice version
```

Server re-runs duplicate invoice checks.

---

# 48. Post Purchase Command

Command:

```text
purchasing.purchase.post
```

Capability:

```text
ONLINE_REQUIRED
```

Payload:

```json
{
  "purchase_id": "uuid",
  "expected_version": 12,
  "accepted_integrity_exception_ids": [],
  "notes": null
}
```

Server performs:

```text
final commercial validation
landed cost
cost reconciliation
pricing reference update
price review signals
audit
```

Result includes final cost summaries.

---

# 49. Purchase Correction

Command:

```text
purchasing.purchase.correct
```

Never changes old historical facts silently.

Payload describes corrected business facts/reason.

Server creates:

```text
Purchase Correction
Cost Reconciliation
Inventory correction if physically needed
Audit
```

---

# 50. Supplier Return Command

```text
purchasing.supplier_return.create
```

Payload references:

```text
Purchase
Purchase Item / Receipt Item
Qty
Reason
```

Server validates returnable accepted quantity.

---

# 51. Stock Adjustment Command

```text
inventory.adjust
```

Payload:

```json
{
  "adjustment_id": "uuid",
  "direction": "OUT",
  "reason_code": "DAMAGED",
  "notes": "...",
  "items": [
    {
      "item_id": "uuid",
      "product_id": "uuid",
      "product_unit_id": "uuid",
      "quantity": "2.000000",
      "conversion_snapshot": "1.00000000"
    }
  ]
}
```

Server creates movements + cost effects.

---

# 52. Opname Commands

Lifecycle commands:

```text
inventory.opname.create
inventory.opname.count
inventory.opname.recount
inventory.opname.review
inventory.opname.post
inventory.opname.cancel
```

`count` payload records:

```text
system_qty_at_count
physical_qty
counted_at
```

Server/local logic marks:

```text
RECOUNT_RECOMMENDED
```

when concurrent movement timing requires it.

---

# 53. Pricing Calculation Query

Calculation is pure and can run client-side.

Server query may also expose:

```text
pricing.preview
```

for authoritative validation.

Input:

```text
Cost
Target Margin
Minimum Margin
Tax
Rounding Rule
Current Price
```

Output:

```text
Recommended Price
Floor Price
Actual Margin
Warnings
```

---

# 54. Price Proposal Create

Command:

```text
pricing.proposal.create
```

May be drafted offline.

Payload groups:

```text
Price Set
Proposal Items
Cost snapshots
Target/floor snapshots
```

No active pricing effect.

---

# 55. Price Proposal Submit

Command:

```text
pricing.proposal.submit
```

Moves proposal to:

```text
PENDING_APPROVAL
```

subject to version check.

---

# 56. Price Approve / Publish

Command:

```text
pricing.proposal.approve
```

Permission:

```text
pricing.approve
```

Capability:

```text
ONLINE_REQUIRED
```

Payload:

```json
{
  "price_set_id": "uuid",
  "expected_version": 4,
  "items": [
    {
      "proposal_item_id": "uuid",
      "final_approved_price": "3500.0000"
    }
  ],
  "effective_from": "...",
  "owner_reason": null
}
```

Server validates no overlapping authoritative version.

---

# 57. Owner Direct Price Change

Command:

```text
pricing.direct_change
```

Permission:

```text
pricing.direct_change
```

Online required.

If below floor:

```text
pricing.override_floor
+
override_reason required
```

---

# 58. Promotion Commands

```text
pricing.promotion.create
pricing.promotion.update_draft
pricing.promotion.publish
pricing.promotion.end
pricing.promotion.cancel
```

Publication follows authoritative server time.

---

# 59. Complete Sale Command

Command:

```text
sales.complete
```

Primary offline-safe aggregate.

---

# 60. Complete Sale Payload

```json
{
  "transaction_id": "uuid",
  "transaction_number": "TRX-260816-7K4P9D",
  "shift_id": "uuid",
  "terminal_id": "uuid",
  "customer_id": null,
  "occurred_at": "...",
  "pricing_context": {
    "trusted_time_status": "TRUSTED",
    "pricing_cache_version": 125
  },
  "items": [
    {
      "transaction_item_id": "uuid",
      "product_id": "uuid",
      "product_unit_id": "uuid",
      "product_name_snapshot": "Indomie Goreng",
      "sku_snapshot": "IND-001",
      "unit_name_snapshot": "PCS",
      "conversion_snapshot": "1.00000000",
      "quantity": "2.000000",
      "base_quantity": "2.000000",
      "base_unit_price_snapshot": "3500.0000",
      "tier_code_snapshot": "RETAIL",
      "tier_unit_price_snapshot": "3500.0000",
      "promotion_id": null,
      "promotion_discount_snapshot": "0.0000",
      "manual_line_discount_snapshot": "0.0000",
      "transaction_discount_allocation": "0.0000",
      "final_unit_price_snapshot": "3500.0000",
      "line_total": "7000.0000",
      "tax_mode_snapshot": "NO_PPN",
      "tax_rate_snapshot": "0.00000000",
      "tax_amount_snapshot": "0.0000",
      "local_cost_unit_snapshot": "2800.00000000",
      "local_cost_status": "FINAL"
    }
  ],
  "payments": [
    {
      "payment_id": "uuid",
      "payment_method_id": "uuid",
      "amount": "7000.0000",
      "confirmation_type": "CASH_CONFIRMED",
      "external_reference": null
    }
  ],
  "transaction_discount": null
}
```

---

# 61. Server Validation of Sale

Server validates/recomputes:

```text
identity
permission
shift reference/state context
Product/Unit identity
base quantities
discount math
payment settlement
duplicate transaction/payment IDs
```

For online current pricing, server may fully validate current published price.

For legitimate offline stale price:

```text
do not retroactively change customer-facing price
```

Instead:

```text
ACCEPTED_WITH_REVIEW
STALE_PRICING_EXCEPTION
```

when policy requires.

---

# 62. Sale Cost Validation

Server uses best valid cost state.

If client cost snapshot differs because offline state is stale:

```text
server records/reconciles final cost separately
```

Historical customer-facing sale price remains unchanged.

If no valid cost exists:

```text
cost_status = COST_PENDING
+
COST_MISSING_EXCEPTION
```

Sale is still accepted when otherwise valid.

---

# 63. Sale Result

```json
{
  "transaction_id": "uuid",
  "transaction_number": "TRX-260816-7K4P9D",
  "status": "COMPLETED",
  "cost_status": "FINAL",
  "stock_effects": [],
  "payment_status": "COMPLETED",
  "warnings": []
}
```

---

# 64. Offline Transaction Number Contract

Human-readable transaction number must be generated collision-resistant offline.

Recommended format:

```text
TRX-YYMMDD-<short globally-derived suffix>
```

Technical `transaction_id` remains canonical.

Do not require global sequential allocation before sale completion.

Server preserves valid unique supplied number.

---

# 65. Split Payment Contract

`payments` array can contain multiple entries.

Validation:

```text
SUM(payment.amount where intended settlement)
=
grand total
```

Cash tendered amount/change may be represented in optional cash metadata:

```json
{
  "tendered_amount": "50000.0000",
  "change_amount": "10000.0000"
}
```

Payment settlement amount remains actual portion due, not tendered gross.

---

# 66. Void Transaction Command

```text
sales.void
```

Permission:

```text
transaction.void
```

Rules:

```text
full transaction only
original shift must still be OPEN
no existing Return
reason required
```

Server creates reversal/compensation effects.

---

# 67. Payment Correction Command

```text
sales.payment.correct
```

Open shift:

```text
Admin / Owner
```

Closed shift:

```text
Owner
```

Payload:

```text
Original Payment ID
Correct Payment Method
Reference
Reason
```

Server creates:

```text
Payment Reversal
New Payment
Cash Reconciliation
Audit
```

---

# 68. Open Shift Command

```text
cash.shift.open
```

Payload:

```json
{
  "shift_id": "uuid",
  "shift_number": "SHF-...",
  "terminal_id": "uuid",
  "opening_cash": "500000.0000",
  "opened_at": "..."
}
```

Offline-safe.

---

# 69. Cash Movement Command

```text
cash.movement.create
```

Types:

```text
CASH_IN
CASH_OUT
SAFE_DROP
```

Payload requires:

```text
shift_id
amount
reason_code
notes optional
```

---

# 70. Close Shift Command

```text
cash.shift.close
```

Offline-safe.

Payload:

```json
{
  "shift_id": "uuid",
  "actual_cash": "2480000.0000",
  "counted_at": "...",
  "variance_reason": null
}
```

Client may display local Expected Cash, but server/local application service recomputes authoritative formula.

---

# 71. Force Close Shift Command

```text
cash.shift.force_close
```

Permission:

```text
shift.force_close
```

Reason required.

If actual cash unavailable:

```text
actual_cash = null
actual_cash_verified = false
```

---

# 72. Return Create/Complete Contract

Normal return uses:

```text
returns.complete
```

Offline-capable when original transaction is cached and policy allows.

---

# 73. Complete Return Payload

```json
{
  "return_id": "uuid",
  "return_number": "RET-260816-...",
  "original_transaction_id": "uuid",
  "return_type": "PARTIAL",
  "receipt_mode": "TRANSACTION_LINKED",
  "shift_id": "uuid",
  "terminal_id": "uuid",
  "occurred_at": "...",
  "items": [
    {
      "return_item_id": "uuid",
      "original_transaction_item_id": "uuid",
      "product_id": "uuid",
      "product_unit_id": "uuid",
      "conversion_snapshot": "1.00000000",
      "return_qty": "1.000000",
      "reason_code": "DAMAGED",
      "disposition": "NOT_RESTOCKED"
    }
  ],
  "refund": {
    "refund_id": "uuid",
    "refund_number": "RFD-...",
    "original_payment_id": "uuid",
    "payment_method_id": "uuid",
    "amount": "3500.0000",
    "override_method": false,
    "override_amount": false,
    "override_reason": null
  }
}
```

---

# 74. Return Server Validation

Server validates:

```text
original transaction
original line
remaining returnable qty
return window
permission
disposition
historical refundable amount
refund maximum
method override permission
```

If two offline devices returned overlapping quantity:

```text
RETURN_QUANTITY_CONFLICT
```

requires controlled reconciliation.

---

# 75. No-Receipt Return Contract

Command:

```text
returns.no_receipt.complete
```

Permission:

```text
return.no_receipt
```

Default:

```text
exchange_only = true
valuation = current active selling price
```

Recommended online-required/restricted offline.

Monetary refund requires Owner override.

---

# 76. Refund Async Lifecycle

If provider refund requires asynchronous confirmation:

`returns.complete` may produce:

```text
Return = COMPLETED
Refund = PENDING
```

Server returns:

```json
{
  "return_status": "COMPLETED",
  "refund_status": "PENDING"
}
```

This is valid, not partial database failure.

---

# 77. Refund Retry/Resolve

Commands:

```text
returns.refund.retry
returns.refund.resolve
returns.refund.reverse
```

Each uses its own idempotency key.

---

# 78. Customer Commands

Lightweight:

```text
sales.customer.create
sales.customer.update
sales.customer.deactivate
```

Customer remains optional for sale.

---

# 79. User & Permission Commands

Online authoritative:

```text
identity.user.create
identity.user.deactivate
identity.membership.role_assign
identity.permission_override.set
identity.device.revoke
```

Permission management should not be offline-finalized.

---

# 80. Authorization Version Update

Any effective permission change increments:

```text
authorization_version
```

Clients receive:

```text
INVALIDATE / PERMISSION_CHANGED
```

and refresh auth context.

---

# 81. Query — Product List

Conceptual:

```http
GET /api/v1/queries/products
```

Filters:

```text
search
status
category_id
brand_id
track_inventory
stock_state
pricing_state
```

Result DTO includes operational summary, not every table column.

---

# 82. Query — Product Detail

```http
GET /api/v1/queries/products/:id
```

Returns contextual hub:

```text
Product identity
Units/barcodes
Stock summary
Cost summary
Current price/margin
Supplier summary
Recent purchase
Recent sale
Attention items
```

Permissions determine sensitive fields.

---

# 83. Query — Purchase Detail

Returns:

```text
Header
Items
Agreement
Invoice
Receipts
Cost summary
Integrity issues
Payment summary
History
```

No client-side joins across dozens of endpoints required for basic detail page.

---

# 84. Query — Inventory Position

```http
GET /api/v1/queries/inventory/positions
```

Pagination + filters:

```text
negative
out_of_stock
low_stock
category
search
```

---

# 85. Query — Stock Movements

```http
GET /api/v1/queries/inventory/movements
```

Filters:

```text
product
movement_type
source_type
date range
actor
```

Each row contains source deep-link metadata.

---

# 86. Query — Pricing Review

```http
GET /api/v1/queries/pricing/review
```

Returns:

```text
Product Unit
Current Price
Pricing Reference Cost
Current Margin
Target Margin
Cost Delta
Review Reason
```

---

# 87. Query — Transaction Detail

Returns permission-aware DTO.

Owner/Admin may receive:

```text
COGS
Gross Profit
Margin
```

Cashier does not.

Common:

```text
Items
Pricing breakdown
Payments
Returns/refunds
Shift
Receipt data
```

---

# 88. Query — Attention Queue

```http
GET /api/v1/queries/attention
```

Filters:

```text
severity
status
domain
date
actor
```

Result:

```text
summary
impact
source link
recommended actions
```

---

# 89. Query — Sync Health

Back Office privileged query:

```text
devices
last sync
pending reported
conflicts
client version
schema version
```

No raw secrets.

---

# 90. Conflict Response Contract

Example:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "details": {
      "entity_type": "product",
      "entity_id": "uuid",
      "local": {
        "expected_version": 5,
        "proposed_changes": {
          "name": "A"
        }
      },
      "server": {
        "version": 6,
        "current": {
          "name": "B"
        }
      }
    }
  }
}
```

Client can show explicit resolution UI.

---

# 91. Conflict Resolution Command

```text
sync.conflict.resolve
```

Payload:

```text
conflict_id
chosen resolution
expected current server version
reason
```

Server applies through owning domain command, not generic row patch.

---

# 92. Immutable Event Merge Rule

Events such as independent Sales generally do not create a mutable conflict.

Server merges unique events by identity.

Possible review:

```text
negative inventory after merge
stale pricing
stale auth
```

---

# 93. Query Cache Validators

Optional optimization:

```http
ETag
If-None-Match
```

may be used for read endpoints.

Not required for sync feed correctness.

---

# 94. API Versioning

Path:

```text
/api/v1
```

Contract changes categorized:

## Non-breaking

```text
add optional response field
add optional request field
add new error code
add new endpoint
```

## Breaking

```text
remove/rename required field
change semantics
change decimal serialization
change command type meaning
```

Breaking changes require new API/contract version or compatibility layer.

---

# 95. Sync Schema Versioning

Client sends:

```text
X-Kastur-Schema-Version
```

and command envelope:

```text
schema_version
```

Server may support a bounded range.

Unsupported:

```text
SCHEMA_VERSION_UNSUPPORTED
```

---

# 96. Client Version Enforcement

For known unsafe clients:

```text
CLIENT_UPDATE_REQUIRED
```

HTTP:

```text
426 Upgrade Required
```

POS should block only when continuing would risk business integrity.

---

# 97. Change Feed Backward Compatibility

Change feed payloads must be versioned/projection-specific.

Recommended:

```json
{
  "payload_version": 1,
  "payload": {}
}
```

Older clients may ignore unknown optional fields.

---

# 98. Sync Ack

Optional endpoint:

```http
POST /api/v1/sync/ack
```

Payload:

```json
{
  "device_id": "uuid",
  "last_applied_sequence": 123500
}
```

Used for diagnostics/retention decisions.

Client correctness does not depend on ack being real-time.

---

# 99. Sync Batch Limits

Server should impose:

```text
max command count
max request bytes
max pull limit
```

Exact values implementation-specific.

Client chunks large outboxes.

---

# 100. Change Feed Retention

Server must not delete change feed entries needed by active supported client cursors without a recovery path.

If cursor is too old:

```text
SYNC_CURSOR_INVALID
```

Server instructs:

```text
FULL_REBOOTSTRAP_REQUIRED
```

---

# 101. Rebootstrap Contract

When client must rebuild cache:

```text
preserve local pending outbox
perform fresh bootstrap
reapply/preserve local unsynced operational records
resume sync
```

Never wipe pending business events blindly.

---

# 102. Local Outbox State Machine

Recommended:

```text
PENDING
SENDING
ACCEPTED
FAILED_RETRYABLE
REQUIRES_REVIEW
```

Accepted entries may be compacted after safe acknowledgment.

---

# 103. Sync Failure UI Contract

Technical error maps to business-friendly summary.

Example:

```text
NETWORK
→ "Belum dapat tersinkron. Data tetap tersimpan di perangkat."

VERSION_CONFLICT
→ "Perubahan bersamaan ditemukan dan perlu ditinjau."
```

---

# 104. Attachment Contract — Deferred

Invoice/photo attachment storage is future-compatible but not core v1 contract.

When introduced:

```text
upload signed/object-storage flow
+
business record reference
```

Do not embed large base64 files in sync payloads.

---

# 105. Reporting API

Reporting endpoints should use server-side aggregation.

Examples:

```text
GET /queries/reports/sales
GET /queries/reports/margin
GET /queries/reports/inventory
GET /queries/reports/purchasing
GET /queries/reports/shift-cash
GET /queries/reports/returns
```

Responses include:

```text
from
to
timezone
completeness
metrics
series
breakdowns
```

---

# 106. Report Completeness Metadata

Example:

```json
{
  "completeness": {
    "status": "POTENTIALLY_INCOMPLETE",
    "offline_devices": 1,
    "oldest_device_sync_at": "..."
  }
}
```

Owner must not be misled when known pending device data exists.

---

# 107. Search Contract

Back Office global search endpoint:

```text
GET /queries/search?q=...
```

Searches:

```text
Product
SKU
Barcode
Purchase
Supplier
Transaction
Customer
```

Returns grouped lightweight navigation results.

---

# 108. Sensitive Field Redaction

Query serializers apply permission-based field redaction.

Example Cashier Transaction DTO excludes:

```text
cost_snapshot
gross_profit
margin
supplier_cost
```

Do not rely on hidden UI alone.

---

# 109. Audit Query Contract

Privileged:

```text
GET /queries/audit
```

Supports:

```text
entity
actor
action
date
domain
risk
```

No mutation endpoint for deleting audit.

---

# 110. Exception Lifecycle Commands

```text
audit.exception.acknowledge
audit.exception.resolve
audit.exception.dismiss
```

Each stores actor/time/reason.

These commands do not mutate the source business record automatically unless resolution command explicitly invokes a domain correction.

---

# 111. Command Naming Convention

Recommended stable pattern:

```text
<domain>.<aggregate_or_resource>.<action>
```

Examples:

```text
catalog.product.create
purchasing.purchase.post
inventory.opname.post
pricing.proposal.approve
sales.complete
cash.shift.close
returns.complete
identity.device.revoke
```

Do not name commands after UI button text.

---

# 112. Query Naming Convention

Conceptual:

```text
<domain>.<read_model>
```

Routes may remain REST-like.

DTO names:

```text
ProductListItemDTO
ProductDetailDTO
PurchaseDetailDTO
TransactionDetailDTO
AttentionItemDTO
```

---

# 113. API DTO vs Domain Entity

Rule:

```text
API DTO
≠
Database Row
≠
Domain Entity
```

This prevents accidental contract coupling to persistence implementation.

---

# 114. Command Handlers Are Business Boundaries

Only command handlers may finalize authoritative mutations.

Avoid generic API:

```text
PATCH /table/:id
```

for critical domains.

---

# 115. Generic PATCH Allowed Scope

May be acceptable for low-risk simple master metadata if still routed through owning domain validation.

Never generic-patch:

```text
stock
cost
active price
completed transaction
payment
closed shift
refund
audit
```

---

# 116. Client-Supplied Snapshots

Client may submit historical snapshots required for offline completion.

Server validates identity/math where possible.

Server never trusts client-supplied:

```text
permission
business ownership
final MWA
active price authority
expected cash authority
```

blindly.

---

# 117. Offline Stale Price Acceptance Rule

For valid offline sale:

```text
actual customer-facing price used
```

is historical fact.

Server does not rewrite transaction item price.

Possible:

```text
ACCEPTED_WITH_REVIEW
```

with pricing exception.

---

# 118. Offline Negative Stock Rule

Server accepts unique sale event if business policy allows.

Merged stock projection may become negative.

Server creates:

```text
INVENTORY_NEGATIVE
```

exception.

No sale deletion.

---

# 119. Offline Cost Pending Rule

Sale may sync with:

```text
local_cost_status = COST_PENDING
```

Server attempts authoritative costing.

If still unavailable:

```text
COST_MISSING_EXCEPTION
```

and later reconciliation.

---

# 120. Offline Shift Close Rule

Client may complete shift close locally.

When server discovers late events:

```text
do not rewrite original closing snapshot
```

Create:

```text
SHIFT_RECONCILIATION_EXCEPTION
+
shift reconciliation record
```

---

# 121. Purchase Offline Rule

Allowed offline:

```text
Draft
Invoice capture
Physical Receiving
Preliminary costing
```

Not final offline:

```text
POSTED
```

Outbox may hold:

```text
purchasing.purchase.request_post
```

but final transition occurs only after online authoritative validation.

---

# 122. Price Offline Rule

Allowed:

```text
Draft Proposal
Calculator
```

Not offline authoritative:

```text
Publish / Activate
```

---

# 123. Identity Offline Rule

Offline clients may use cached authorization within policy window.

User/role/permission management itself is online authoritative.

---

# 124. Notification Topics

Optional WebSocket topics are internal, e.g.:

```text
business:<id>
device:<id>
```

Server should not rely on client subscribing to security-sensitive events for correctness.

Pull/auth validation remains authoritative.

---

# 125. Correlation Contract

All internal effects of one command share:

```text
correlation_id
```

If client does not provide one:

```text
server may set correlation_id = command_id
```

---

# 126. Request Trace Contract

Every response returns:

```text
request_id
```

Logs include:

```text
request_id
command_id
correlation_id
user_id
device_id
business_id
```

No secrets.

---

# 127. Rate-Limit Semantics

Rate limiting must avoid breaking normal POS sync.

Different policy buckets may exist for:

```text
login
queries
command push
large sync pull
```

HTTP 429 includes retry metadata.

---

# 128. Command Size Safety

Large commands such as bulk imports should not masquerade as one huge normal transactional command.

Use dedicated bulk/import APIs with batch semantics.

---

# 129. Import API Contract

Conceptual:

```text
POST /imports
POST /imports/:id/validate
POST /imports/:id/commit
GET  /imports/:id/results
```

Import commit creates explicit opening/master events.

---

# 130. Import Idempotency

Import commit itself is idempotent.

Per-row mapping uses stable batch/row identities to prevent duplicate Product/Opening Stock effects.

---

# 131. Health Endpoint

```http
GET /api/v1/system/health
```

Public/minimal:

```json
{
  "ok": true,
  "version": "..."
}
```

No database secrets or detailed infrastructure state.

---

# 132. Client Compatibility Endpoint

```http
GET /api/v1/system/compatibility
```

May return:

```text
minimum supported client version
current API version
supported schema version range
maintenance mode
```

Useful before large sync/bootstrap.

---

# 133. Maintenance Mode

If server enters maintenance:

Safe local POS operation may continue if offline-capable.

Cloud command responses indicate:

```text
REJECTED_RETRYABLE
MAINTENANCE
```

Client keeps outbox.

---

# 134. API Security Invariants

1. All business queries scoped by authenticated Business Membership.
2. All writes checked server-side for permission.
3. Device ID is provenance, not authentication.
4. Client cannot choose another business by payload alone.
5. No database credentials in client.
6. No static privileged sync token shipped in frontend.
7. Secrets are never written to Audit/Sync logs.
8. Sensitive query fields are permission-filtered server-side.

---

# 135. API Consistency Invariants

1. Same command ID cannot create duplicate business effects.
2. Same mutable update cannot silently overwrite newer version.
3. Completed Sale command is atomic.
4. Receive Goods command is atomic.
5. Post Purchase command is atomic.
6. Publish Price command is atomic.
7. Complete Return command is atomic.
8. Close Shift command is atomic.
9. Sync batch may partially accept commands, but each accepted command is individually atomic.
10. Client cursor advances only after successful local application.

---

# 136. Sync Invariants

1. Cloud snapshot overwrite is not primary sync.
2. Sync push calls same application command handlers as online writes.
3. Sync pull uses server monotonic cursor.
4. WebSocket only tells client to pull.
5. Idempotency is server-persisted.
6. Pending local outbox survives restart.
7. Rebootstrap preserves unsynced local business records/outbox.
8. Immutable business facts are reconciled rather than last-write-wins overwritten.
9. Mutable master conflicts surface explicit server/local versions.
10. Known stale pricing/auth can create review exceptions without falsifying historical events.

---

# 137. Contract Testing Requirements

Every command contract should have tests for:

```text
happy path
permission denial
validation failure
idempotent retry
version conflict if mutable
offline stale state where applicable
atomic rollback on internal failure
stable error code
```

---

# 138. Sync Contract Tests

Required scenarios:

```text
Complete sale offline → push → accepted
Same sale pushed twice → one transaction
Timeout after server commit → retry → prior result
Two devices sell same stock → both events merge
Stale price → accepted with review
Stale auth → policy-dependent accepted/rejected
Old master update → VERSION_CONFLICT
Pull pages → exact cursor advancement
Rebootstrap with pending outbox → no lost sale
Return qty conflict → review required
Late shift event → reconciliation exception
```

---

# 139. Open Implementation Choices

Still intentionally deferred:

```text
Bearer token vs secure cookie
exact auth provider
exact endpoint router library
exact schema validation library
exact decimal library
exact WebSocket implementation
exact page size limits
exact sync retention duration
exact report cache strategy
```

These do not alter contract semantics.

---

# 140. Suggested First Contract Implementation Order

```text
1. Auth Context
2. Bootstrap
3. Product/Unit Query Cache
4. Published Pricing Query/Cache
5. Open Shift
6. Complete Sale
7. Sync Push
8. Sync Pull
9. Cash Movements / Close Shift
10. Purchasing Receive
11. Purchase Post
12. Pricing Proposal/Approve
13. Inventory Adjustment/Opname
14. Returns/Refunds
15. Attention / Conflicts
16. Reporting
```

This order supports early end-to-end POS operation.

---

# 141. Final API + Sync Contract

```text
CLIENT
  ↓
AUTH CONTEXT
  ↓
LOCAL BUSINESS COMMAND
  ↓
LOCAL ATOMIC COMMIT
  ↓
OUTBOX
  ↓
POST /sync/push
  ↓
SERVER COMMAND HANDLER
  ↓
AUTH + PERMISSION
  ↓
IDEMPOTENCY
  ↓
VERSION / BUSINESS VALIDATION
  ↓
POSTGRESQL TRANSACTION
  ├── DOMAIN RECORDS
  ├── LEDGER EVENTS
  ├── AUDIT
  ├── EXCEPTION IF NEEDED
  └── CHANGE FEED
  ↓
COMMAND RESULT
  ↓
CLIENT MARKS OUTBOX ACCEPTED
  ↓
GET /sync/pull
  ↓
APPLY CHANGES
  ↓
ADVANCE CURSOR
```

---

# 142. Contract Decisions Locked in v1

```text
API-001 JSON over HTTPS
API-002 /api/v1 version namespace
API-003 Stable command_type identifiers
API-004 UUID command IDs
API-005 Idempotency-Key required for durable commands
API-006 Decimal values serialized as strings
API-007 expected_version optimistic concurrency
API-008 Server-derived Business scope
API-009 Device ID is provenance, not authentication
API-010 Business Status separated from Sync Status
API-011 Batch sync is transport batching, not one DB transaction
API-012 Each accepted command is atomic
API-013 Bootstrap returns snapshot + cursor
API-014 Pull uses server monotonic cursor
API-015 Cursor advances after successful local apply
API-016 Push uses same business command handlers as online APIs
API-017 WebSocket is invalidation/notification only
API-018 Stale offline sale price is preserved historically
API-019 Stale offline auth can create review exceptions
API-020 Price publication online-required
API-021 Purchase POSTED online-required
API-022 Physical receiving offline-safe
API-023 Cash sale / shift operations offline-safe
API-024 Return and Refund statuses independent
API-025 Stable error-code registry
API-026 Permission-based server-side field redaction
API-027 No generic mutation of ledgers/historical records
API-028 Rebootstrap must preserve pending local outbox
API-029 Client compatibility/schema version explicit
API-030 No shared privileged build-time sync token
```

---

# 143. Recommended Next Phase

After API + Sync Contract v1:

```text
DESIGN SYSTEM v1
```

Then:

```text
SCREEN / UX SPECIFICATIONS
LEGACY CODE AUDIT
IMPLEMENTATION ROADMAP
AGENTS.md
CODEX HANDOFF
```

Design System should define:

```text
Design principles
Tokens
Typography
Spacing
Density
Forms
Tables
Status/Exception semantics
Touch targets
Navigation patterns
Responsive behavior
POS-specific high-speed interaction patterns
Back Office data-density patterns
```

---

# Final Contract Principle

> **Kastur clients issue business commands, not database mutations. Every durable command has a stable identity and idempotent server behavior; mutable master data uses explicit version checks, while completed operational events are preserved and reconciled. Bootstrap plus incremental cursor-based synchronization makes the POS resilient offline without turning local device state into a competing canonical database.**
