# Architecture Map

Kastur is one product with three independently deployed applications:

```text
Back Office browser ───── authenticated HTTP ─┐
                                              v
POS browser/PWA ─ durable HTTP sync ─────> apps/api ──> PostgreSQL
      │                                       ^
      └── Dexie business records + outbox ────┘
```

`apps/api` is a Worker-class modular monolith. Its domain-owned handlers cover
catalog, purchasing/costing, pricing, inventory, sales, cash, returns, sync,
identity, and reporting. Request authentication and a request-scoped PostgreSQL
adapter are composed at the API boundary. Cross-domain facts are written inside
one PostgreSQL transaction; ledgers are never reconstructed from audit.

`apps/pos` composes cached authorization, local catalog/pricing projections,
shift/cash/sales commands, receipt rendering, and `@kastur/sync-client` over the
single `@kastur/local-db` Dexie owner. A completed offline-safe Sale is durable
before the network is involved. Restart and PWA updates must preserve pending
outbox records.

`apps/backoffice` composes authenticated API clients and permission-aware
operational routes. It does not own a second business-rule implementation and
does not read PostgreSQL directly.

Shared boundaries:

| Workspace | Responsibility |
|---|---|
| `packages/contracts` | API/command DTO vocabulary |
| `packages/domain` | pure domain rules and deterministic calculations |
| `packages/numeric` | decimal-safe authoritative arithmetic |
| `packages/local-db` | Dexie schemas and atomic local operations |
| `packages/sync-client` | HTTP sync transport, retry, and orchestration |
| `packages/auth-client` | client authorization/quick-lock primitives |
| `packages/ui` | shared visual tokens and primitives |
| `database/migrations` | canonical PostgreSQL schema history |

Durable sync is `bootstrap → outbox push with stable command_id → idempotent
PostgreSQL transaction → monotonic change feed → cursor pull/ack`. WebSocket
hints, full snapshot replacement, and generic CRUD mutation are not canonical
transport.
