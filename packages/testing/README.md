# `@kastur/testing`

This private source workspace is reserved for small reusable test helpers that are justified by concrete tests in more than one workspace.

Repository configuration audits live under `tooling/tests` so this package does not need dependency edges to every other workspace. Domain fixtures and factories will be added only alongside the domain behavior that needs them.

It currently exports no helper API. Tests use explicit Vitest imports and the
named projects in the root `vitest.config.ts` until a helper has multiple real
consumers.
