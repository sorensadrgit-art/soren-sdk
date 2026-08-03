# Phase 5 public service contracts

Consume only `@soren-sdk/config`.

- Configuration: validated project configuration loading through the package barrel.
- Policy: the resolved-policy provider through the package barrel. It returns canonical immutable policy data, digest, and provenance.
- Lockfile: lockfile read/create through the package barrel.
- Drift: lockfile drift inspection through the package barrel.

Public errors are typed configuration/policy/lockfile errors. Consumers must treat errors as safe messages and codes, not parser output. Phase 6 must not deep-import package sources, parse YAML directly, reimplement canonical digesting, or create another policy contract.

Package export metadata supplies the declaration and ESM entry point. Focused typecheck and package builds validated the declarations and entry points.