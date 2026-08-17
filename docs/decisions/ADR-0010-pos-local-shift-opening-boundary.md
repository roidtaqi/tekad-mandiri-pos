# ADR-0010: POS Local Shift Opening Boundary

- **Status**: Accepted
- **Date**: 2026-08-17
- **Scope**: M2-003

## Context

The POS Core Offline Sale vertical slice requires a running Shift
before a Cashier can complete any transaction. M2-003 establishes
the minimal local Shift Open boundary: the POS device must be able
to open a Shift entirely offline, validated against cached
authorization, without depending on server availability.

## Decision

### A. M2-003 is local Shift Open only

This milestone implements only the `openShift` command and
`getActiveShift` query in the POS local Dexie database. No server
Shift API, PostgreSQL `cash.shifts` table, close/force-close,
reconciliation, cash ledger, or outbox is created.

### B. Shift Open is OFFLINE_SAFE

A successfully opened local Shift is a committed business fact,
not a draft. It persists through page refresh, browser restart,
and PWA update. Recovery must never discard an unsynced open Shift.

### C. POS Schema V4

The `shifts` object store is added in POS Dexie schema version 4.
V1, V2, and V3 declarations remain immutable and byte-identical.

### D. OPEN business status

A newly opened Shift has `status = "OPEN"`. This is a business
domain status indicating the Shift is operationally active.

### E. PENDING sync status

A locally created Shift starts with `sync_status = "PENDING"`.
Business status and sync status are always separate concerns.

### F. Cached authorization requirement

The Shift Open command validates that the caller's cached
`AuthContextResponse` satisfies:

- `offline_valid_until >= opened_at` (local command time)
- Permissions include both `workspace.pos.access` and `shift.open`

Role labels (including `"OWNER"`) are never used as permission
authority. Expired cached authorization is rejected.

### G. `workspace.pos.access` + `shift.open`

These are the two required permissions. `shift.read`, `cash.read`,
`pricing.read`, and role name checks are not required.

### H. Raw money string + @kastur/numeric validation

`opening_cash` is persisted as the original lexical decimal string
(e.g., `"500000.0000"` stays `"500000.0000"`). It is validated via
`parseMoney()` from `@kastur/numeric` and must be non-negative.
Zero is valid. No `number` type is accepted at runtime.

### I. Collision-resistant `shift_id`

`shift_id` is generated locally using `crypto.randomUUID()`. It is
the technical identity of the Shift record.

### J. `shift_number` is not identity

`shift_number` is a derived display/reference value (e.g., UUID
prefix). It is never used as a primary key, foreign key, or
uniqueness constraint.

### K. `active_context_key` is local concurrency infrastructure

A deterministic JSON-serialized key built from
`[business_id, location_id, device_id]` enforces
at most one OPEN Shift per operational context. It has a Dexie
unique index (`&active_context_key`) providing database-level race
protection. Both application pre-check and native constraint
violation are mapped to the stable `ACTIVE_SHIFT_ALREADY_EXISTS`
error code.

### L. No PostgreSQL `cash.shifts` yet

M2-003 does not create migration `000008` or any PostgreSQL schema.
The canonical cloud Shift table belongs to M4.

### M. No cash ledger

Opening cash is a starting drawer balance, not revenue. No cash
movement or ledger event is created from `opening_cash`.

### N. No close, force-close, or reconciliation

Shift close, blind count, variance, force-close, and
reconciliation belong to M4.

### O. No outbox

M2-007 owns the durable outbox. M3 owns sync.

### P. M4 owns full Shift/Cash domain

PostgreSQL persistence, cash movements, Cash In/Out, Safe Drop,
shift review, and reporting are M4 scope.

## Consequences

- POS can open a Shift entirely offline with validated cached
  authorization, satisfying the M2 offline sale prerequisite.
- The `shifts` store is schema-safe and upgrade-compatible.
- Concurrent duplicate opens are prevented at the database level.
- Future M4 Shift Close can remove `active_context_key` to allow
  historical CLOSED shifts to coexist.
- `authorization_version` is persisted for future sync provenance.
