# Soren SDK Lockfile

This document describes the `soren-sdk.lock` contract: what it binds, how its
digest works, what it refuses to contain, how drift is reported, and the CLI
commands that create, inspect, and check it. It is the reference for
`@soren-sdk/config`'s `LockfileService` and the `soren-sdk lock *` CLI commands.

## What a lock binds

A `SorenSdkLock` is an immutable record of the inputs a run was resolved
against:

- `projectSnapshotDigest` — the inspected project snapshot
- `catalogSnapshotDigest` — the connector catalog snapshot
- `policySnapshotDigest` — the resolved policy snapshot
- `configDigest` — the normalized project configuration digest
- `routePlanId` / `routePlanDigest` — the route plan binding
- `capabilityOntologyVersion` — the capability catalog version
- `connectors` — the selected connectors and their resolved integrations
- `unavailable` — connectors that were rejected, with a reason code
- `protocolResolutions` / `runtimeResolutions` — resolved protocol/runtime pins

## Immutable digest

`computeLockDigest` produces the lock's `digest`:

- the lock is normalized (connectors, integrations, protocol/runtime
  resolutions, and unavailable entries sorted by stable key),
- `generatedAt` and `digest` are excluded,
- the result is the `digestJson` canonical-JSON SHA-256 digest.

Consequences:

- Reordering inputs never changes the digest.
- Two locks created at different times with identical bindings share a digest.
- **Any tampering with a bound field is detected**: `validate` re-derives the
  digest and reports a `digest-mismatch` issue.

## Refused content

`LockfileService.create` refuses inputs that would create an unsafe lock:

- **Credential-like strings** — any string value matching
  `/token|secret|password|credential|api[_-]?key|authorization/i` raises
  `LOCK_CREDENTIAL_REJECTED`. The check walks every string in the input,
  including connector ids, integration ids, and reasons.
- **Absolute paths** — any string starting with `/` or a Windows drive raises
  `LOCK_ABSOLUTE_PATH_REJECTED`, keeping locks relocatable.

## Drift semantics

`LockfileService.compare(lock, current)` reports a `LockDriftReport`:

| Drift                            | Severity  |
| -------------------------------- | --------- |
| project / catalog / policy snapshot changed | `critical` |
| `configDigest` changed           | `critical` |
| route plan id or digest changed  | `critical` |
| a locked connector missing from current | `critical` |
| integration presence drift (added/removed) | `warning` |
| a current connector not locked   | `warning` |

`inSync` is `true` only when there are zero `critical` drifts. When the caller
does not supply a current connector set (`CurrentResolutionInputs.connectors` is
omitted), connector/integration drift is skipped and only snapshot/config/route
digests are compared.

## CLI

```
soren-sdk lock inspect [path] [--json]                      # validate (exit 1 on invalid)
soren-sdk lock check [path] [--project <path>]
                    [--route-plan <path>] [--json]          # exit 1 on critical drift
soren-sdk lock create --project <path> --output <path>
                    --route-plan <path> [--force] [--json]  # atomic write
```

- `lock inspect` validates an existing lock file (schema + digest recheck).
- `lock check` validates the lock, computes current inputs (project snapshot,
  catalog snapshot, policy snapshot, config digest, and route plan from
  `--route-plan` or the empty-plan default), and prints the drift report.
- `lock create` computes the same current inputs, builds the lock, and writes
  it atomically (`temp file + rename`) via `NodeFileSystem.writeFileAtomic`.
  Writing guards: the output path must not traverse `..`, must not be (or
  contain) a symbolic link, and must not already exist unless `--force` is
  given. `--output` and `--route-plan` are required.

Read commands (`inspect`, `check`) never write to disk.
