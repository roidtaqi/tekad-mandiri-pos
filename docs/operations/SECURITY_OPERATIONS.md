# Security Operations

## Enforced controls

- opaque user sessions are stored only as SHA-256 hashes in PostgreSQL;
- active user, membership, Device, session expiry/revocation, and effective
  permissions are evaluated by the server on every authenticated request;
- POS sessions are bound to an active same-Business Device UUID;
- mutable authority changes increment authorization version and offline
  authorization has an explicit expiry;
- Business scope is derived from authentication, never trusted from a browser
  payload;
- frontend builds contain no database URL or privileged shared token;
- API and static responses install baseline security headers and JSON request
  bodies are size-limited.

Edge abuse controls are environment-owned: configure Cloudflare rate limiting
for authentication, sync push, and write-command routes before pilot. Do not add
an in-memory Worker counter as a distributed security boundary. Restrict
Hyperdrive/PostgreSQL network access and grant the runtime role only required
schema privileges.

## Session incident procedure

1. Revoke affected `identity.sessions`; revoke the Device when device trust is
   lost.
2. Increment the membership authorization version after role/permission
   changes so cached authorization becomes stale.
3. Preserve audit, command, ledger, and change-feed evidence.
4. Rotate deployment secrets/bindings in the platform; never paste them into an
   issue or repository file.
5. Verify revoked-session, revoked-device, cross-Business, and permission-denied
   tests before restoring access.

Logs may contain request/correlation/command IDs, stable error codes, timings,
and actor IDs. They must not contain bearer secrets, cookies, database URLs,
plaintext credentials, full payment references, or unredacted sensitive DTOs.

The repository provides controlled opaque-session issuance for development and
operations. Selection and enrollment of a production identity provider and
credential-recovery policy remain deployment decisions and require a reviewed
ADR before public rollout.
