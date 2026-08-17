# External Gates

Tracks dependencies on external world elements (e.g., real infrastructure, physical hardware, legitimate credentials) that block autonomous completion.

| Gate | Description | Blocked Milestones | Runbook/Script | Status |
|---|---|---|---|---|
| TEST_DATABASE_URL | PostgreSQL connection string for integration tests | CI `database-integration` | Provide env var | BLOCKED_EXTERNAL |
