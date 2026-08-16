# Migrations

All production database changes must use ordered, version-controlled migrations. Application startup must not be the primary mechanism for creating or changing critical production tables.

Migration-library selection and the executable migration harness are intentionally deferred to **M0-003**, where the choice can be made alongside the API runtime and PostgreSQL integration. M0-001 selects no migration library, creates no schema, and therefore requires no tooling ADR.
