# `@kastur/config`

This private source workspace is the reserved boundary for small, validated,
non-secret runtime configuration primitives that genuinely need more than one
consumer.

It must not contain:

- business rules or domain policy;
- arbitrary global constants;
- credentials, tokens, or other secrets;
- direct environment-variable access that bypasses an application's runtime boundary; or
- mutable cross-domain global state.

It currently exports no API. Add one only with a concrete consumer and
validation requirement; application-specific environment access stays in each
composition root.
