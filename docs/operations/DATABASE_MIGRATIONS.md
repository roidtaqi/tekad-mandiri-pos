# Database and Migrations

PostgreSQL is canonical shared persistence. SQL files in
`database/migrations` are a forward-only, zero-padded, contiguous history. Do
not edit an applied migration; append a corrective migration.

```bash
npm run db:migrate:check
DATABASE_URL='postgresql://...' npm run db:migrate:status
DATABASE_URL='postgresql://...' npm run db:migrate
```

`DATABASE_URL` must be a direct unpooled server/tooling endpoint for the exact
target. The runner validates history, takes an advisory lock, and commits each
migration together with its history row. It stops on divergence or failure.

Deployment order:

1. Confirm a successful provider backup/PITR checkpoint and approved recovery
   target for the environment.
2. Run `db:migrate:status` and archive its output with the release evidence.
3. Apply migrations once from a controlled release job.
4. Run status again and verify the exact repository prefix.
5. Deploy API/frontends only when their compatibility with that prefix is known.

Application startup never applies migrations. Schema rollback is a new forward
migration; application rollback must remain compatible with the already-applied
schema. Never use a pooled endpoint for DDL and never run test cleanup against a
shared database.

See [Backup and recovery](./BACKUP_RECOVERY.md) before staging or production
changes and [Migration and staging](./MIGRATION_STAGING.md) for legacy import.
