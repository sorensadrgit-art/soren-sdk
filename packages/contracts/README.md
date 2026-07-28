# @soren-sdk/contracts

Versioned JSON Schema contracts, runtime validation, deterministic canonical JSON, SHA-256 digests, typed errors, and migration scaffolding for Soren SDK.

## Source-of-truth method

JSON Schema Draft 2020-12 files in the repository root `schemas/` directory are the runtime source of truth.

TypeScript interfaces in `src/types/contracts.ts` are the public compatibility view.

Every contract change must update:

1. The JSON Schema
2. The TypeScript interface
3. A valid fixture using `satisfies` or typed assignment where practical
4. An invalid runtime fixture
5. Schema-version and migration tests when persisted shape changes

CI checks runtime fixtures, TypeScript compilation, unknown-property rejection, schema-version rejection, and deterministic serialization.

## Public exports

- Contract interfaces
- Schema-version constants
- `ContractValidator`
- `validateContract`
- `assertContract`
- `validateConnectorManifest`
- `canonicalJson`
- `sha256Bytes`
- `digestJson`
- Typed errors and migration registry

## Security

The package never stores credentials and does not execute commands or mutate projects.
