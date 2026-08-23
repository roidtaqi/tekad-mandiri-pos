# Deployment and Release

## Staging sequence

1. Freeze the candidate SHA and obtain green `verify` and
   `database-integration` jobs for that exact SHA.
2. Configure the staging PostgreSQL/Hyperdrive binding and platform secrets;
   configure trusted same-origin routing for `/api`.
3. Confirm backup/PITR and run the migration status/apply/status sequence.
4. Deploy API, Back Office, and POS as independent artifacts from the same SHA.
5. Verify security headers, `/health`, authentication, Device binding, and
   permission denial.
6. Execute staging readiness/reconciliation plus Gates A–I with real staging
   identifiers. Preserve output as release evidence.
7. Test PWA update/restart with unresolved outbox, supported scanners, and both
   receipt widths on actual target hardware.

## Release checklist

- [ ] authoritative docs/ADRs and schema registry match the candidate
- [ ] no unresolved migration divergence or critical reconciliation finding
- [ ] no frontend secret/static privileged token in source or build artifacts
- [ ] edge rate limits, TLS, CSP/security headers, and log redaction verified
- [ ] approved backup policy and successful restore drill recorded
- [ ] production Business/Owner/Device/Terminal created through controlled ops
- [ ] pilot exit criteria and support/escalation owner approved
- [ ] rollback-compatible API/frontend artifacts retained
- [ ] legacy freeze/export checksum and migration review signed off
- [ ] production go/no-go and cutover window explicitly authorized

Frontend/API rollback redeploys a known compatible artifact. Database history is
forward-only: repair with a reviewed migration, never delete an applied history
row or run an improvised down migration. If sync or ledger integrity is
uncertain, stop new writes at the narrowest safe boundary, preserve evidence,
and reconcile before resuming.

Physical pilot and production cutover are external actions. `READY` means the
software/runbook is prepared; it does not mean those actions occurred.
