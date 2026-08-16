# Database workspace

PostgreSQL is Kastur's canonical shared cloud database. This directory is reserved for versioned migrations, controlled seed categories, and database-support scripts.

M0-001 creates only the repository boundaries. It does not define application tables or choose an ORM/query builder.

- [`migrations/`](./migrations/) — production schema changes, once the M0-003 harness is approved
- [`seeds/`](./seeds/) — future system defaults, development/demo data, and onboarding data kept explicitly separate
- [`scripts/`](./scripts/) — future database operations and verification scripts
