# Phase 8: Plans, Verification, and Evidence

## Scope

Phase 8 produces read-only, reviewable execution plans and verifies reported runner results. It never applies a plan, executes a command, writes a project, fetches an artifact, or treats agent prose as proof.

## Data flow

```text
Planning input + deterministic requirements
  -> canonical immutable plan payload
  -> SHA-256 plan ID and digest
  -> verification requirement set
  -> trusted runner result ingestion
  -> artifact metadata and digest checks
  -> evidence envelope with content-addressed digest
```

Inputs contain project, catalog, policy, and route identities, plus proposed dependency, file, command, network, credential-name, rollback, and verification data. File changes carry only path and content digest. Artifacts carry only an opaque ID, kind, path or URI, digest, media type, and redaction state.

## Determinism and plan drift

The planner sorts dependencies, file changes, commands, required checks, and artifact references by stable keys before calculating canonical JSON SHA-256 digests. `createdAt` is recorded but excluded from immutable plan payloads. A runner result is accepted only when its plan ID and immutable digest match exactly. Any mismatch is `PLAN_DRIFT`.

## Verification states

Every required check has exactly one state:

- `passed`: only a trusted runner result with matching plan ID, runner ID, started/completed timestamps, exit code zero, and verified artifacts can create this state.
- `failed`: a trusted runner result with non-zero exit status or verified failure state.
- `not-required`: explicit planner decision with a reason.
- `not-run`: required check missing runner evidence.

An agent claim, text note, or an untrusted runner never upgrades a required check to `passed`. Missing proof remains `not-run` and is also recorded in `unverified`.

## Evidence integrity and redaction

Evidence records only stable identifiers for project, catalog, policy, route, and plan. Artifact digest mismatches fail ingestion. Artifact metadata is redacted before evidence generation: secrets in paths, URIs, labels, command output, or metadata are replaced with `[REDACTED]`; raw artifact bodies are never embedded. Evidence digest excludes run timestamps so logically equivalent results remain content-addressed while the timestamps remain audit metadata.

## Affected scope

Affected scope is calculated from planned file changes and dependency workspaces. Required checks include explicit check requirements and checks matched by changed path prefixes. Scope calculation is read-only and deterministic.

## Trust boundaries

- The planner validates structured input but does not invoke a runner.
- The verification service accepts a `TrustedRunner` interface only in tests or a future independently authenticated runner integration.
- No agent identity, model identifier, credential value, command output body, or source-file body becomes runner proof.
- `apply` is not implemented or reachable from any planner API.
