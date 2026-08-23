# External Gates

Only facts that require legitimate infrastructure, data, credentials, people,
or real-world authorization belong here. Missing software or a failing
repository check is never `BLOCKED_EXTERNAL`.

| Gate | External fact/evidence required | Blocked milestone(s) | Runbook | Status |
|---|---|---|---|---|
| EXT-01 — Production infrastructure | Authorized Cloudflare account/routes, production PostgreSQL/Hyperdrive, domains/TLS, platform secrets, runtime least-privilege grants, and measured edge controls | M15, M16 | [`docs/operations/RUNTIME_CONFIGURATION.md`](../operations/RUNTIME_CONFIGURATION.md), [`docs/operations/DEPLOYMENT_RELEASE.md`](../operations/DEPLOYMENT_RELEASE.md), [`docs/operations/SECURITY_OPERATIONS.md`](../operations/SECURITY_OPERATIONS.md) | BLOCKED_EXTERNAL |
| EXT-02 — Production identity and enrollment | Owner-approved production IdP/session issuance, named-user enrollment and recovery policy, active Business memberships, Device and Terminal assignments; no shared/static frontend credential | M15, M16 | [`docs/operations/SECURITY_OPERATIONS.md`](../operations/SECURITY_OPERATIONS.md), [`database/scripts/README.md`](../../database/scripts/README.md) | BLOCKED_EXTERNAL |
| EXT-03 — Backup policy and real recovery evidence | Owner-approved RPO/RTO/retention/encryption/region/access; provider PITR/backup enabled; real environment restore drill and approval | M15, M16 | [`docs/operations/BACKUP_RECOVERY.md`](../operations/BACKUP_RECOVERY.md), [`docs/operations/DATABASE_MIGRATIONS.md`](../operations/DATABASE_MIGRATIONS.md) | BLOCKED_EXTERNAL |
| EXT-04 — Reviewed legacy exports | Actual legacy exports with freeze timestamp/checksums, explicit source/location policy, manual review decisions, staging import/reconciliation output, and sign-off | M15, M16 | [`docs/operations/MIGRATION_STAGING.md`](../operations/MIGRATION_STAGING.md) | BLOCKED_EXTERNAL |
| EXT-05 — Physical pilot | Authorized pilot site, trained named users, supported target browser/device, scanner/printer evidence, real operational scenarios, monitoring/support owner, and signed exit result | M15, M16 | [`docs/operations/DEPLOYMENT_RELEASE.md`](../operations/DEPLOYMENT_RELEASE.md), [`docs/operations/OFFLINE_SYNC_TROUBLESHOOTING.md`](../operations/OFFLINE_SYNC_TROUBLESHOOTING.md) | BLOCKED_EXTERNAL |
| EXT-06 — Production cutover | Successful pilot exit, approved legacy freeze, final reconciliation, production go/no-go, cutover window, support/escalation ownership, and rollback authorization | M16 | [`docs/operations/DEPLOYMENT_RELEASE.md`](../operations/DEPLOYMENT_RELEASE.md), [`docs/operations/BACKUP_RECOVERY.md`](../operations/BACKUP_RECOVERY.md) | BLOCKED_EXTERNAL |

`TEST_DATABASE_URL` is deliberately not an external gate. It is a disposable,
loopback-only PostgreSQL test-harness input documented in
[`docs/operations/TESTING_CI.md`](../operations/TESTING_CI.md). A missing local or
CI test database is a verification setup issue, not evidence that M15/M16 are
blocked by the outside world.
