# ADR 0015: POS Offline Restart E2E Boundary (M2-009)

## Context

Milestone 2 (M2) establishes the "POS Core Offline Sale" operational spine.
Sub-milestones M2-001 through M2-008 have implemented the isolated domain capabilities:
- Local Shift Opening
- POS Catalog Bootstrap & Auth Cache
- POS Shell
- Scanner Capture & Product Lookup
- Cart & Totals
- Cash Payment
- CompleteSale Local Atomic Outbox
- Receipt 80/58 Renderer

M2-009 requires proving the end-to-end integration of these capabilities in a realistic offline environment, specifically ensuring that a locally completed offline sale survives a browser restart.

## Decision

1. **Integration Target**: We will build the `Sell` screen within `apps/pos` to integrate all M2 hooks. This screen will support the primary POS operational flow: Open Shift -> Scan -> Cart -> Cash Payment -> Complete -> Receipt.
2. **Offline Restart Guarantee**: We will prove via an E2E test (or comprehensive integration test) that a completed transaction written to Dexie, along with its outbox event, survives a simulated browser restart (e.g. re-instantiating the local database connection) and can be queried.
3. **No Sync Push Yet**: M2-009 strictly focuses on the *local* offline survival. Network synchronization (push/pull) is deferred to M3. The E2E test will verify the Outbox record is persisted, which is the contract for M3.
4. **Test Implementation**: We will add an integration test in `apps/pos/src/e2e-offline.test.tsx` (or similar) that orchestrates the domain hooks in sequence, simulating user actions, and then "restarts" the environment to verify persistence.
5. **UI Fidelity**: The UI implemented in M2-009 will be functional but minimal, adhering to the Kastur Design System, enough to satisfy the operational flow.

## Consequences

- M2 will be fully complete and verified.
- The POS application will have a functioning main cash register interface.
- We have a clear boundary between M2 (local offline survival) and M3 (network sync).
