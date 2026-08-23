# Offline and Sync Troubleshooting

The POS sync indicator represents all unresolved outbox states:

| State | Meaning | Operator action |
|---|---|---|
| `PENDING` | Durable locally; not claimed yet | Reconnect and sync |
| `SENDING` | Leased by the current sync attempt | Wait; expired leases recover automatically |
| `FAILED_RETRYABLE` | Transport/temporary failure | Keep data; retry after backoff |
| `REQUIRES_REVIEW` | Explicit conflict or business review | Resolve in Back Office; do not replay blindly |
| `ACCEPTED` | Server accepted exactly once | No action |

Never clear IndexedDB, unregister the PWA, delete the outbox, or use
`clear()+bulkPut()` as recovery while unresolved work exists.

Safe diagnosis:

1. Record the Business, Device, Terminal, user, local command ID, last error,
   and time. Do not record bearer/session secrets.
2. Confirm network reachability and `/health` before retrying.
3. Check session expiry, Device status, membership status, permission version,
   and Terminal context. Revocation must fail closed.
4. Retry with the same command ID. A new ID after an unknown result can create a
   different business event and is forbidden.
5. For `REQUIRES_REVIEW`, inspect the server conflict/exception and source
   ledger. Never edit completed Sale, stock, or cash facts to hide the conflict.
6. Pull/ack the monotonic cursor after accepted push. A second client should
   observe the canonical event.

If the server has revoked/expired the original session, Device, membership, or
permission while completed offline facts remain pending, reconnect with the
same historical personal session on the same Device/Terminal. POS switches the
signed cache to `RECOVERY_ONLY`, pushes only the grant-bound offline-safe facts
through the controlled recovery endpoint, and never re-enables new offline
work. Accepted facts are marked `AUTHORIZATION_STALE_EXCEPTION` for review.
Mutable/online-authoritative commands cannot use this path. Never copy a grant,
bearer, or outbox to another device as a workaround.

A controlled rebootstrap may replace only scoped projections and sync state; it
must preserve unresolved outbox/business records. Back up the browser profile
before forensic work. Escalate repeated cursor mismatch, idempotency fingerprint
mismatch, or ledger projection mismatch with the correlation and command IDs.

Receipt printing is downstream of Sale completion. A printer failure permits a
reprint and must never roll back or duplicate the Sale.
