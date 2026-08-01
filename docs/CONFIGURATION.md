# Soren SDK Configuration

This document describes how a project declares its Soren SDK configuration, how
the SDK discovers, parses, and digests it, and the security properties of the
parse path. It is the reference for the `@soren-sdk/config` package's
configuration reader and the `soren-sdk config show` CLI command.

## Configuration files

A project's Soren SDK configuration lives in a `.soren-sdk` directory at the
project root. Two formats are supported; the reader accepts at most one file.

| File                    | Format | Contract kind   |
| ----------------------- | ------ | --------------- |
| `.soren-sdk/config.yaml` | YAML   | `soren-config`  |
| `.soren-sdk/config.json` | JSON   | `soren-config`  |

If both files exist, loading fails with `CONFIG_AMBIGUOUS` rather than guessing.
If neither exists, loading fails with `CONFIG_NOT_FOUND`.

## The `soren-config` contract

Every configuration file must satisfy the `soren-config` contract
(`packages/contracts/src/schemas/soren-config.schema.json`):

```json
{
  "schemaVersion": "1.0.0-draft.1",
  "contractKind": "soren-config",
  "configId": "my-project",
  "preferences": {
    "preferredProviders": ["web-platform"],
    "forbiddenProviders": [],
    "maxProviders": 2
  }
}
```

- `configId` is required and must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- `preferences` is optional. All of its members are optional. The arrays must
  contain unique values.
- Unknown top-level or preference fields are rejected (`additionalProperties:
  false`).

## Discovery

Discovery walks a fixed candidate list for the given root:

- config: `.soren-sdk/config.yaml`, then `.soren-sdk/config.json`
- policy: `.soren-sdk/policy.yaml`, then `.soren-sdk/policy.json`

`findSingleSource` returns the single present candidate and raises
`CONFIG_AMBIGUOUS` when more than one is present.

## Parsing and untrusted input

Configuration is untrusted input. The parser (`packages/config/src/parse.ts`)
hardens both the YAML and JSON paths:

- **Duplicate keys** are rejected (`CONFIG_DUPLICATE_KEY`). The YAML loader is
  deliberately run without the `json: true` option so that js-yaml's built-in
  duplicate-key detection fires instead of silently keeping the last value.
- **Alias bombs / self-referential aliases** are rejected (`CONFIG_ALIAS`). The
  text is pre-scanned for `[&*][A-Za-z_][A-Za-z0-9_-]*` alias/anchor tokens
  before parsing, because js-yaml v4 removed `maxAliasCount`.
- **Non-JSON numerics** (`.nan`, `.inf`, `+.inf`…) are rejected (`CONFIG_PARSE`)
  by pre-scan, because the JSON schema coerces them to `null`, which would
  silently corrupt values.
- **Unsafe prototype keys** (`__proto__`, `constructor`, `prototype`) are
  rejected (`CONFIG_UNSAFE_KEY`), as are `NaN`/`Infinity` numbers, non-plain
  objects, and unsupported value types.
- Parse failures map to `CONFIG_PARSE` with the offending path.

## Normalization and digest

After contract validation, `normalizeSorenConfig` produces a canonical form:

- list preferences are deduplicated and sorted (`stableUnique`),
- absent optional members are dropped rather than stored as `null`/`undefined`.

The configuration digest is `digestJson` of the normalized value, i.e. the
canonical-JSON SHA-256 digest (a `sha256:…` string). Two projects with
differently-ordered preference lists therefore share a digest, while any
semantic difference changes it. This digest is what a `SorenSdkLock` binds via
`configDigest`.

## CLI

```
soren-sdk config show [--project <path>] [--json]
```

`config show` is read-only: it loads and normalizes the project configuration
and prints either a human summary or `{ config, digest, source }` as JSON.
Missing or invalid configuration exits non-zero (`CONFIG_NOT_FOUND`,
`CONFIG_INVALID`, …).
