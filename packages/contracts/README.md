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

CI checks runtime fixtures, TypeScript compilation, unknown-property rejection, schema-version rejection, deterministic serialization, and repository-level connector validation.

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

## Validation layers

Connector validation intentionally has two layers:

1. **Structural JSON Schema validation** for shape, primitive constraints, unknown fields, and artifact requirements.
2. **Semantic validation** for cross-field and catalog-aware rules such as selectable connectors with blockers, publisher policy, version placeholders, license resolution, remote MCP network scopes, and exclusive ownership conflicts.

This separation keeps public diagnostic keywords stable instead of exposing incidental Ajv keywords for domain rules.

## Reproducibility

Canonical JSON sorts object keys recursively, rejects non-finite numbers, cycles, and non-plain objects, and normalizes negative zero. SHA-256 digests are computed over canonical bytes so equivalent JSON values produce identical digests regardless of key insertion order.

## Security

The package:

- Never stores credentials
- Never executes commands
- Never mutates target projects
- Rejects unknown stable contract fields
- Uses strict Ajv validation
- Runs in CI with read-only repository permissions and a frozen lockfile
