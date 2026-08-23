# Runtime Configuration

## API

`apps/api` resolves its PostgreSQL connection in this order:

1. `HYPERDRIVE.connectionString` for a deployed Worker;
2. server-only `DATABASE_URL` for local development.

Production must configure the Hyperdrive binding in the environment-specific
Cloudflare configuration; binding IDs and credentials are intentionally not
committed. Local Wrangler reads ignored `apps/api/.dev.vars`. The API fails
closed with `DATABASE_NOT_CONFIGURED` when a database-backed route lacks either
source.

The checked-in compatibility date and `nodejs_compat` flag are reviewed runtime
inputs. After changing them, run `npm run api:types`, commit the generated type
file, and execute the full verification campaign.

Offline-safe POS authority is signed with an ECDSA P-256 key held only by the
API. Generate a deployment pair with:

```bash
npm run auth:offline-key:generate
```

Store the emitted server values in the API secret manager:

```dotenv
OFFLINE_AUTH_SIGNING_KEY_ID=kastur-offline-YYYY-MM-DD
OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK={...private JWK...}
```

Never commit or expose the private JWK. A partial/malformed key configuration
fails closed on POS authorization requests.

## Frontends

Production should expose the frontends and `/api` through the same trusted
origin. POS accepts these non-secret build values:

```dotenv
VITE_API_BASE_URL=https://kastur.example/
VITE_OFFLINE_AUTH_KEY_ID=kastur-offline-YYYY-MM-DD
VITE_OFFLINE_AUTH_PUBLIC_KEY_JWK={...public JWK...}
```

When the API URL is absent, POS uses the current origin. When the public key pair
is absent, online operation remains available but POS intentionally does not
create an offline authorization cache. The key ID/public JWK must be configured
together and must match the API signer. Back Office uses current-origin `/api`.
Do not introduce a browser-visible database URL, service token, privileged sync
token, or authentication secret. The repository boundary test rejects known
secret-like frontend configuration.

Static security headers live in each app's `public/_headers`; verify that the
chosen hosting platform installs their equivalent. If an architecture later
requires cross-origin API access, record the exact trusted-origin/CORS decision
before deployment rather than enabling a wildcard.

## Request context

- `Authorization: Bearer <opaque user session>` or the same-origin session cookie
  authenticates the user.
- POS sends its bound `X-Kastur-Device-Id` and selected `X-Terminal-Id`.
- Sync sends explicit client/schema metadata and stable command IDs.
- PostgreSQL money, cost, price, and quantity decimals remain API strings.

Secrets belong in the deployment platform's secret store. Rotate/revoke them
using [Security operations](./SECURITY_OPERATIONS.md).

Do not discard a signing private key while any grant issued by it can still be
needed for a pending outbox recovery. Key rotation requires an overlap/recovery
plan covering the maximum session TTL and operational outbox retention window.
