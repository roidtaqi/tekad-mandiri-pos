# `@kastur/config`

This private source workspace is the future boundary for small, validated, non-secret application and runtime configuration primitives that genuinely need to be shared.

It must not contain:

- business rules or domain policy;
- arbitrary global constants;
- credentials, tokens, or other secrets;
- direct environment-variable access that bypasses an application's runtime boundary; or
- mutable cross-domain global state.

M0-002 intentionally exports no configuration API. A public export should be added only with a concrete consumer and validation requirement.
