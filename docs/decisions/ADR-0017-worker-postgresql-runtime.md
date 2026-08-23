# ADR-0017: Worker PostgreSQL runtime through request-scoped Hyperdrive connections

Status: Accepted  
Date: 2026-08-23

## Context

The API was initially scaffolded without a database transport. Kastur now needs real authenticated command and query handlers against canonical PostgreSQL. The Worker must not contain a static database credential, and connection objects must not leak across requests.

Cloudflare's supported PostgreSQL path for Worker runtimes is Hyperdrive with the `pg` driver. The pinned runtime supports this through `nodejs_compat`. Local development and automated integration tests also need an explicit secret-provided direct connection seam.

## Decision

- Production binds Hyperdrive as `HYPERDRIVE`; its `connectionString` is read only inside the Worker request composition root.
- Local Worker execution may use a `DATABASE_URL` secret when no Hyperdrive binding exists. It is never a Vite variable and never enters a frontend bundle.
- A fresh `pg.Client` is created, connected, used, and closed within each request-scoped database operation. Transactions never span requests.
- Domain routes depend on a narrow SQL/transaction port so tests can exercise handlers without a live network connection.
- `nodejs_compat` is enabled as a reviewed infrastructure dependency. Production API source still must not import Node built-ins or use Node globals directly.
- Migrations continue to use the separate Node-only direct-connection runner from ADR-0001; Hyperdrive is not used for schema migration locks.

## Consequences

Deployment must provision the `HYPERDRIVE` binding and keep the origin connection secret in Cloudflare. Local operators provide `DATABASE_URL` through Wrangler secrets or process environment, never checked-in configuration. Database failures can be mapped at the application boundary without exposing connection strings.

This ADR supersedes only ADR-0001's deferral of the future Worker query transport. It does not change the forward-only migration policy.
