# Local Development

Use Node.js from `.nvmrc`, npm, and a disposable PostgreSQL 16 database. Never
point local tests or bootstrap tooling at production.

```bash
nvm use
npm ci
npm run db:migrate:check
DATABASE_URL='postgresql://...' npm run db:migrate
```

Create ignored `apps/api/.dev.vars`:

```dotenv
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/kastur_dev
```

Run these in separate terminals:

```bash
npm run dev:api
npm run dev:pos
npm run dev:backoffice
```

Both Vite development servers proxy `/api` to `http://127.0.0.1:8787`.

For an empty database:

1. Open POS and copy the local Device UUID shown on the session screen.
2. Run the guarded command below with that exact UUID.
3. Copy the one-time `session_secret` and `terminal_id` from stdout.
4. Enter both values in POS. Use the session secret in Back Office.

```bash
DATABASE_URL='postgresql://...' npm run db:business:bootstrap -- \
  --confirm-create \
  --business-name='Toko Lokal' \
  --owner-name='Pemilik Lokal' \
  --device-id='<POS device UUID>'
```

The command is transactional and is only for the first operational context. To
issue a new session for existing records:

```bash
DATABASE_URL='postgresql://...' npm run db:session:issue -- \
  --business-id='<uuid>' \
  --user-id='<uuid>' \
  --device-id='<uuid>'
```

Do not put either output secret in `.env`, source, screenshots, fixtures, shell
history intended for sharing, or browser `localStorage`. Frontend runtime keeps
the live bearer in `sessionStorage`; POS local quick lock stores only a derived
verifier and cached authorization.

Before handing off a change, run the checks in [Testing and CI](./TESTING_CI.md).
