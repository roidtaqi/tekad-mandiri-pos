# `@kastur/testing`

This private source workspace is reserved for small reusable test helpers that are justified by concrete tests in more than one workspace.

Repository configuration audits live under `tooling/tests` so this package does not need dependency edges to every other workspace. Domain fixtures and factories will be added only alongside the domain behavior that needs them.

M0-002 intentionally exports no helper API. Tests use explicit Vitest imports and the named projects in the root `vitest.config.ts`.
