# ADR-0003: Auth and Session Contract Foundation

Status: Accepted
Date: 2026-08-16
Scope: M1-003

Context:
- M1-003 establishes the persistence and wire-contract foundation for sessions and authorization context.
- Actual credential verification and auth provider implementations remain deferred.
- The `identity` schema requires tables for `devices`, `sessions`, and `authorization_versions`.

Decision:
1. Stable Device identity is separate from User identity.
2. Session is server-side authenticated usage state.
3. Only a session-secret HASH is persisted.
4. No plaintext session secret is stored in PostgreSQL.
5. Exact authentication provider remains deferred.
6. Exact client auth transport remains deferred: Bearer token vs secure cookie is NOT decided here.
7. Password/PIN credential implementation remains deferred.
8. Explicit `authorization_versions` is selected over reusing `business_memberships.version`.
9. Offline authorization snapshot is versioned and expires.
10. Risk/permission authority still comes from M1-002 registry.
11. Terminal/Device assignment is deferred until Terminal exists.
12. Client permission helper is UX/offline-context convenience only.
13. Authoritative server permission validation remains mandatory.
14. Session lifetime duration is NOT decided here.
15. Offline authorization TTL duration is NOT decided here.
16. Refresh-token/token-rotation strategy is NOT decided here.

Consequences:
- The database schema is ready to track sessions and devices without forcing premature decisions on authentication providers or transports.
- Explicit authorization versioning isolates permission evaluation logic from membership domain logic.
- Client applications can cache permissions to deliver offline UX without compromising on server-side authority.
