# Soren SDK Policy Resolution

This document describes how the Soren SDK resolves layered project policy into
a single, tighten-only effective policy and a verifiable snapshot. It is the
reference for `@soren-sdk/config`'s `PolicyResolver` and the `soren-sdk policy
resolve` CLI command.

## Layers and order

Policy resolves from a fixed ordered set of layers, lowest precedence first:

| # | Layer          | Source                                        |
| - | -------------- | --------------------------------------------- |
| 0 | `builtin`      | `BUILTIN_POLICY` (hard-safety baseline)       |
| 1 | `organization` | passed in via `ResolvePolicyInput`            |
| 2 | `workspace`    | `.soren-sdk/policy.{yaml,json}` found by walk-up from the project root |
| 3 | `project`      | `.soren-sdk/policy.{yaml,json}` at the project root |
| 4 | `run`          | passed in via `ResolvePolicyInput`            |

The workspace layer is discovered by walking up from `dirname(projectRoot)`
until a policy file is found or the walk reaches `workspaceRoot` (when
configured) or the filesystem root.

## Tighten-only resolution

Resolution is **tighten-only**: no layer may loosen a decision made by an
earlier (lower-precedence) layer. The `PolicyDocument.rules` shape and the rule:

| Rule                 | Allowed direction                                   | Empty-list meaning |
| -------------------- | --------------------------------------------------- | ------------------ |
| `allowedConnectors`  | subset-only after the first non-empty set           | no constraint      |
| `deniedConnectors`   | add-only (union)                                    | n/a                |
| `allowedLicenses`    | subset-only after the first non-empty set           | no constraint      |
| `allowExperimental`  | `true → false` only                                 | n/a                |
| `allowPaidServices`  | `true → false` only                                 | n/a                |
| `allowRemoteProjectContent` | `true → false` only                          | n/a                |
| `requireReducedMotion` | `false → true` only                               | n/a                |
| `network.mode`       | rank `unrestricted(0) → allowlist(1) → deny(2)`     | n/a                |
| `network.allowedHosts` | subset-only; only meaningful when mode is `allowlist` | no constraint   |
| `filesystem.read` / `filesystem.write` | subset-only            | no constraint      |
| `maxBundleKilobytes` | only ever decreases (`null` = no constraint)        | `null` = unset     |
| `requiredApprovals`  | add-only (union)                                    | n/a                |

A violation raises `POLICY_WEAKENING_DENIED` (field, layer, and offending value
are recorded on the error). Because the builtin baseline locks
`allowExperimental`, `allowPaidServices`, `allowRemoteProjectContent` to
`false`, `requireReducedMotion` to `true`, and `network.mode` to `deny`, most
"loosening" attempts are rejected outright — only additive denials, license
restrictions, filesystem shrinkage, and approval requirements can actually take
effect through layers.

### Deny union

`deniedConnectors` accumulate across layers. After folding, any denied connector
is stripped from the effective allowlist, producing a
`POLICY_DENY_INHERITED` decision with `inheritedDeny: true` and layer `run` when
the strip actually changed the list.

## Provenance and decisions

Every effective value is backed by a `PolicyDecision`:

```ts
{
  field: string;              // public field name, e.g. "allowedConnectors"
  value: boolean | number | string | string[];
  reasonCode: string;         // e.g. "POLICY_SOURCE_PROJECT", "POLICY_TIGHTEN",
                              //      "POLICY_DENY_INHERITED"
  layer: PolicyScope;         // the layer that decided the value
  sourcePolicyId: string | null; // policyId of the source layer, null for builtin
  inheritedDeny: boolean;
}
```

Baseline decisions for builtin-locked booleans and the network mode are recorded
with `reasonCode: "POLICY_SOURCE_BUILTIN"` so the resolved policy is fully
self-explaining. `policyIdOf()` returns `null` for the builtin layer.

## Snapshot

`ResolvedPolicy.snapshotId` is the `digestJson` digest of the normalized
effective document (with a deterministic placeholder policy id and scope
`run`). Two resolutions that produce the same effective document always share a
snapshot id; any effective difference changes it. This snapshot id is what a
`SorenSdkLock` binds via `policySnapshotDigest`, and what
`ResolvedPolicyProvider` serves by digest.

## CLI

```
soren-sdk policy resolve [--project <path>] [--json]
```

`policy resolve` is read-only. It discovers workspace/project layers from the
project root, folds them over the builtin baseline, and prints either a human
summary or the full `ResolvedPolicy` as JSON. A weakening attempt exits
non-zero with `POLICY_WEAKENING_DENIED`.
