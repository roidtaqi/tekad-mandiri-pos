# Threat Model

Scope: Kastur POS/Back Office browsers, Worker API, PostgreSQL/Hyperdrive,
deployment secrets, local Dexie data, command sync, and migration tooling. Real
payment-provider integrations and production identity enrollment require their
own review when selected.

## Assets and trust boundaries

Critical assets are user/session authority, Business isolation, completed Sales
and Payments, Stock/Cash ledgers, Price/Cost history, Return/Refund facts,
idempotency/change-feed state, audit evidence, unresolved POS outbox, and
database/deployment credentials.

Trust boundaries exist between browser and API, cached offline authority and
fresh server authority, one Business and another, Device/Terminal and user,
Worker and PostgreSQL, migration operator and database, and legacy input and the
staging importer.

## Threats and controls

| Threat | Required control/evidence |
|---|---|
| Stolen/replayed bearer | Opaque high-entropy secret, hash-only storage, expiry, session/Device revoke, TLS, no secret logging |
| Cross-Business object access | Server derives Business from session; scoped queries/FKs; integration tests use foreign IDs |
| Privilege escalation/stale role | Server permission check per command, authorization version, server-signed offline grant, offline expiry, revoke tests |
| Compromised/lost POS | Device/Terminal/session-bound signed grant, Device revoke, quick-lock verifier rather than plaintext PIN/token in persistent storage |
| Tampered offline cache | Pinned public verification key, ECDSA signature over exact authorization scope, bearer-to-signature cache binding, local privilege-escalation regression |
| Revoked device with pending facts | Recovery accepts only signed, in-window offline-safe fact commands with historical bearer possession; always review-flagged; no pull/bootstrap/new command authority |
| Duplicate/altered offline command | Stable command ID, request fingerprint, PostgreSQL idempotency transaction, immutable completed facts |
| Outbox loss during update/recovery | Dexie atomic write, persistent unresolved status, lease recovery, rebootstrap preservation; no destructive reset |
| Ledger or price tampering | Domain-owned append-only movements/versions, constraints, audited commands, no generic CRUD mutation |
| Injection/oversized request | Parameterized SQL, explicit DTO validation, JSON body limit, stable error envelopes |
| Browser injection/clickjacking | CSP and static/API security headers, React escaping, no unsafe HTML business rendering |
| API abuse/denial of service | Cloudflare rate limits/WAF at distributed edge, body limit, pagination, database timeouts/monitoring |
| Secret leakage in build/repo | server-only binding/secret store, boundary scan, artifact review, no privileged `VITE_*` value |
| Malicious/ambiguous legacy data | parse untrusted JSON/CSV, deterministic validation, dry run, review queue, initial events—not fake Purchases |
| Backup theft or destructive restore | encrypted provider backups, separated access, audit, isolated restore drill, approved retention/RPO/RTO |
| Dependency/supply-chain compromise | lockfile install with `npm ci`, reviewed updates, CI build/tests; deployment provenance retained |

## Residual/external decisions

- Production identity provider, enrollment, recovery, MFA, and session TTL policy
  need a reviewed deployment ADR.
- Edge rate thresholds depend on measured staging traffic and must be configured
  in the Cloudflare account.
- Backup RPO/RTO/retention and restore-drill cadence require owner approval.
- Physical scanner/printer/browser kiosk controls require target-device pilot
  evidence.

Any change to authentication, cross-origin routing, payment integration,
credential persistence, or authoritative sync transport reopens this review.
