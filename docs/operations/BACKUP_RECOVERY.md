# Backup and Recovery

The production owner must approve explicit RPO, RTO, retention, encryption,
region, access, and legal requirements. The repository does not invent those
values. Until they are approved and a real restore drill is evidenced, backup
readiness remains an external gate.

Minimum environment controls:

1. Enable provider-managed continuous recovery/PITR and encrypted scheduled
   backups for PostgreSQL.
2. Separate backup administration from normal application credentials and log
   every restore/export action.
3. Create a named pre-migration checkpoint for each production schema release.
4. Restore into an isolated non-production database on the approved cadence.
5. Apply the repository migration-status check to the restored database.
6. Reconcile counts and authority chains for Business/membership, completed
   Sales/items/payments, Stock Movement, Cash Movement/closed Shift snapshots,
   Price Versions, idempotency records, change feed, and unresolved exceptions.
7. Record duration, recovered timestamp, checksum/count evidence, deviations,
   and approver; destroy the isolated restore according to policy.

Recovery order is PostgreSQL first, then API, then frontends. POS devices keep
locally completed unresolved work: after server recovery, push with the original
command IDs and pull from the last acknowledged cursor. Do not restore a stale
browser snapshot over newer outbox data and do not force a full local database
replacement.

If a restore predates acknowledged client commands, stop automatic cleanup and
reconcile idempotency/change-feed evidence before accepting retries. Completed
Sales, Stock/Cash movements, Returns/Refunds, and closed Shift snapshots remain
immutable; corrections use explicit domain events.
