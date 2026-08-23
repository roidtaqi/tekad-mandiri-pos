# Reliability Evidence — 2026-08-23

This is repository-development evidence, not a production backup-policy or
pilot claim.

## PostgreSQL restore drill

Environment: disposable local PostgreSQL 16 container, isolated source and
restore databases.

Procedure:

1. created empty source and target databases;
2. applied the complete 22-file repository migration prefix to source;
3. ran the guarded first-Business bootstrap transaction;
4. created a PostgreSQL custom-format dump with `pg_dump -Fc`;
5. restored it into the empty target with `pg_restore --exit-on-error`;
6. queried migration history, Business, hash-only session, and bootstrap audit
   facts from the restored target;
7. dropped both databases and removed the temporary dump.

Observed target:

```text
schema migrations: 22
businesses: 1
sessions with 64-hex SHA-256 hash: 1
BUSINESS_BOOTSTRAPPED audit events: 1
```

Result: PASS. Transactional bootstrap facts and migration history survived the
dump/restore path. The temporary databases/dump were deleted after verification.

Still external: provider-managed PITR, production encryption/retention/RPO/RTO,
production-sized restore duration, and owner-approved restore cadence.
