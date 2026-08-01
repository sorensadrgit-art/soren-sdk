# Integration Notes — Phase 5 (Configuration, Policy Resolution, Lockfile)

This document records the provider-neutral integration seams introduced in
Phase 5, the temporary assumptions they encode, and how later phases are
expected to consume them.

## Ports introduced

### `ResolvedPolicyProvider` (`packages/config/src/resolved-policy-provider.ts`)

- `getResolvedPolicy(input: ResolvePolicyInput): ResolvedPolicy`
- `MemoryResolvedPolicyProvider` implements the port with a preloaded map keyed
  by `policyFingerprint(input)` (a digest of `projectRoot` +
  organization/run policy ids).

**Why a port:** Phases 6–9 (REST/MCP/TypeScript SDK surfaces) must be able to
resolve policy without depending on the filesystem-backed `PolicyResolver`.
They consume `ResolvedPolicyProvider` and receive precomputed snapshots.

**Future mapping (not implemented here):**

| Phase | Consumer | Contract |
| --- | --- | --- |
| 6 (REST) | `GET /policy/resolved` | returns `ResolvedPolicy` |
| 7 (MCP) | `policy.resolve` tool | wraps `ResolvedPolicyProvider` |
| 8 (evidence) | evidence envelope | binds `ResolvedPolicy.snapshotId` |
| 9 (TypeScript SDK) | `sdk.policy.resolve()` | thin wrapper over the port |

Phase 8 evidence binding uses `snapshotId` as the stable policy reference; the
`ResolvedPolicy.document` is the normalized, signed-able payload.

### `ConfigurationReaderPort` (`packages/config/src/configuration.ts`)

`Pick<ConfigurationReader, "loadProjectConfig" | "loadPolicyLayers">`. The CLI
and `PolicyResolver` use the concrete `ConfigurationReader`; other phases should
program against this port.

### `PolicyResolverPort` (`packages/config/src/policy.ts`)

`Pick<PolicyResolver, "resolve">`. The lockfile service and CLI use the concrete
`PolicyResolver`; the provider-backed path uses `ResolvedPolicyProvider`.

## Temporary assumptions (to be revisited)

1. **`workspaceRoot` discovery.** `loadPolicyLayers` walks ancestors of
   `projectRoot` up to an optional `workspaceRoot` bound. There is no explicit
   "workspace root" marker file yet; the first ancestor with a
   `.soren-sdk/policy.{yaml,json}` is treated as the workspace layer. A future
   phase may introduce an explicit workspace marker.

2. **Builtin allowlist semantics.** An empty `allowedConnectors` /
   `allowedLicenses` / `allowedHosts` / `filesystem.*` list at a layer means
   "no allow constraint at this layer"; the resolver falls back to
   deny-by-default (`[]`) at the end. This mirrors the Phase 4
   `assertTightening` model.

3. **Network locked to `deny`.** The builtin baseline sets
   `network.mode: "deny"`. Under tighten-only resolution, no higher layer can
   loosen mode to `allowlist`/`unrestricted`, so `network.allowedHosts` is
   effectively always `[]` in resolved policies. The subset fold for
   `allowedHosts` is implemented for correctness but is currently unreachable;
   revisit if a future phase relaxes the builtin baseline.

4. **Config preference shape.** `SorenConfig.preferences` is currently
   `preferredProviders` / `forbiddenProviders` / `maxProviders` and is not yet
   consumed by the router (Phase 4 `RouteRequest.preferences` is the active
   surface). Route wiring from config preferences to route requests is a later
   phase concern.

5. **`configId` is informational.** It is validated (lowercase
   dash-separated) and bound into the config digest but not yet matched against
   any registry of known project ids.

6. **Lockfile `routePlanId`/`routePlanDigest`.** The lock binds the route plan
   that produced the resolution. If no route plan exists (empty digest), the
   CLI `lock check`/`lock create` still bind `routePlanDigest` as the digest of
   `""`; route-plan *generation* is owned by the Phase 4 router.

7. **Provider fingerprints ignore workspace/project layer contents.** The
   fingerprint only includes `projectRoot` + org/run policy ids. Workspace and
   project layer *content* is assumed to be resolved by the caller before
   preloading; consumers must refresh snapshots when layer files change.

8. **`CurrentResolutionInputs.connectors` is optional.** The plan's
   `CurrentResolutionInputs` did not carry the current selected-connector set;
   `LockfileService.compare` accepts an optional `connectors` field. When it is
   omitted, connector/integration presence drift is skipped (only snapshot,
   config, and route digests are compared). When provided (even empty), the
   locked set is diffed against the current set: a locked connector missing
   from current is `critical`, integration presence drift is `warning`.

## Provider-neutrality

- No consumer in `packages/config` imports `node:fs` at module top level except
  `NodeFileSystem` (an adapter, injected by the CLI). Core logic is pure and
  testable with `MemoryFileSystem`.
- All digests use `digestJson` from `@soren-sdk/contracts` (canonical JSON +
  SHA-256), so snapshots are portable across processes.
