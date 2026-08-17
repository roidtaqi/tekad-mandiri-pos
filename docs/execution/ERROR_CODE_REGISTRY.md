# Error Code Registry

| Error Code | Meaning | Owner |
|---|---|---|
| IDEMPOTENCY_KEY_REUSE_ERROR | Command ID reused with different payload | M2-007 (Local DB) |
| SALE_CART_INTEGRITY_INVALID | Cart data is invalid or tampered | M2-007 (Local DB) |
| SALE_NUMERIC_BOUNDARY_INVALID | Precision or scale of money/qty invalid | M2-007 (Local DB) |
| SALE_UNIT_CONVERSION_INVALID | Conversion factor invalid | M2-007 (Local DB) |
| PAYMENT_INSUFFICIENT | Payment less than total | M2-007 (Local DB) |
| SALE_PERMISSION_DENIED | User lacks required permissions | M2-007 (Local DB) |
| SALE_AUTHORIZATION_EXPIRED | Offline authorization timestamp expired | M2-007 (Local DB) |
| SALE_TERMINAL_REQUIRED | Terminal ID missing for CompleteSale | M2-007 (Local DB) |
| EMPTY_CART | Cart lines empty | M2-007 (Local DB) |
| SHIFT_REQUIRED | No active shift found | M2-007 (Local DB) |
| SALE_SHIFT_CONTEXT_MISMATCH | Shift exists but user/device mismatch | M2-007 (Local DB) |
