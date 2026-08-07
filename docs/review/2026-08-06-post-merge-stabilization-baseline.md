# Soren SDK 0.1 Post-Merge Stabilization Baseline

- **Target SHA:** `7d51a4e832948d0da27edb3e1a81a8dca6c37f5d`
- **Node:** `>=24`
- **pnpm:** `11.17.0`
- **Baseline CI:** `31066932920`
- **Release mode:** strictly read-only
- **Deferred:** PR #46 remains deferred until 0.1 stabilization completes

## Finding Count Summary

### Active reviewer findings

- **P1:** 3
- **P2:** 5

### Resolved reviewer findings

- **P1:** 0
- **P2:** 1

### Additional unscored release blockers

- **Count:** 2

## Active Reviewer Findings

| ID | Severity | Source | Location | Failure scenario | Status | Workstream | Required regression |
|---|---|---|---|---|---|---:|---|
| F-001 | P1 | https://github.com/sorensadrgit-art/soren-sdk/pull/48#discussion_r3725576677 | `packages/core/src/read-only-gateway.ts:149` | Project-content authorization is not bound to a trusted workspace identity, allowing valid consent labels to be reused against another root. | Active | 2 | A grant/consent for workspace A must deny workspace B before provider dispatch; persist only the canonical workspace digest, never the raw root. |
| F-002 | P1 | https://github.com/sorensadrgit-art/soren-sdk/pull/48#discussion_r3725576679 | `packages/core/src/read-only-gateway.ts:169` | The negotiated protocol version and extensions are not carried through or atomically enforced at provider execution. | Active | 3 | Provider dispatch must receive the authorized negotiated protocol state and reject version/extension mismatch before execution. |
| F-003 | P1 | https://github.com/sorensadrgit-art/soren-sdk/pull/48#discussion_r3725576681 | `packages/core/src/audit.ts:3-4` | Shared audit records lack sufficient non-secret run/provider/grant/tool/workspace correlation to attribute authorization outcomes. | Active | 4 | Chained in-memory and SQLite audit records must remain attributable across concurrent runs without persisting secrets or request payloads. |
| F-004 | P2 | https://github.com/sorensadrgit-art/soren-sdk/pull/47#discussion_r3721322756 | `packages/core/src/read-only-gateway.ts:153` | Reservation-time quota denial occurs before the gateway outcome-recording path and can leave no audit event. | Active | 4 | Reservation quota denial must append a stable closed audit code before rethrow and must not dispatch the provider. |
| F-005 | P2 | https://github.com/sorensadrgit-art/soren-sdk/pull/45#discussion_r3720702952 | `packages/core/src/read-only-gateway.ts:187` | A schema-valid provider response rejected during quota commit can leave the audit chain unchanged. | Active | 4 | Per-call and total-response quota commit denials must emit the appropriate stable audit event while preserving accounting. |
| F-006 | P2 | https://github.com/sorensadrgit-art/soren-sdk/pull/48#discussion_r3725576683 | `packages/core/src/sqlite-run-grants.ts:108-110` | Two SQLite clients can authorize the same revision and cause a benign reservation race to fail spuriously. | Active | 5 | Store-layer reservation must re-read/re-authorize and perform a bounded retry only for benign revision races, with deterministic two-connection coverage. |
| F-007 | P2 | https://github.com/sorensadrgit-art/soren-sdk/pull/48#discussion_r3725576686 | `schemas/evidence-envelope.schema.json:21` | An incompatible evidence-envelope shape reused `1.0.0-draft.1`, preventing reliable format selection and migration. | Active | 6 | V1 and V2 must use distinct schema identities/versions and an object-union dispatcher with deterministic parsing and migration. |
| F-008 | P2 | https://github.com/sorensadrgit-art/soren-sdk/pull/45#discussion_r3717323757 | `schemas/evidence-envelope.schema.json:24-29` | The new evidence shape removed the authenticated principal, allowing otherwise-valid completed evidence to become unattributed. | Active | 6 | Principal identity must survive V1 parsing, migration, V2 emission, validation, and digest/identity derivation. |

## Additional Unscored Release Blockers

| ID | Source | Location | Release blocker | Status | Workstream | Required regression |
|---|---|---|---|---|---:|---|
| F-009 | Internal post-merge code inspection | `packages/application/src/application.ts` | Production application composition still falls back to fake providers instead of real adapters or explicit unavailable dependencies. | Active — unscored | 7 | Production defaults must contain no fake runtime adapters; genuinely unavailable dependencies must fail explicitly with `UNAVAILABLE`. |
| F-010 | Internal post-merge code inspection | `packages/apply/src/public.ts` | Apply/mutation implementation remains publicly reachable despite Release 0.1 being strictly read-only. | Active — unscored | 8 | Package exports, subpaths, declarations, and packed artifacts must not expose apply/mutation entry points in the 0.1 release surface. |

## Resolved Reviewer Findings

| ID | Severity | Source | Resolution evidence | Location | Status | Resolution |
|---|---|---|---|---|---|---|
| F-011 | P2 | https://github.com/sorensadrgit-art/soren-sdk/pull/47#discussion_r3721118784 | https://github.com/sorensadrgit-art/soren-sdk/pull/47#discussion_r3721219243 | `packages/core/src/run-grants.ts` | Resolved | In-memory reservation commits now authenticate and account against the persisted reservation independently of later grant revision advances; creation-order, reverse-order, and tampered-handle regressions cover the fix. |

## Release Constraints

- Release 0.1 remains strictly read-only.
- Apply execution, command execution, package installation, project writes, and mutation-capable public surfaces must remain unreachable.
- Policy-approved read-only provider network access is permitted only through the authorized gateway boundary.
- No P1 or P2 reviewer finding may remain unresolved at release.
- The four legacy connector warnings for Lenis, React Three Fiber, shadcn, and Storybook remain explicitly deferred.
- PR #46 remains deferred/superseded and must not be revived during stabilization.

## Workstream Order

1. Baseline and findings ledger.
2. Trusted workspace scope for grants and consent.
3. Negotiated protocol execution context.
4. Attributable audit events and quota-denial auditing.
5. SQLite benign-race retry.
6. Evidence V1/V2 contract and principal preservation.
7. Production application composition.
8. Read-only Apply package boundary.
9. Documentation reconciliation.
10. Exact-SHA release-candidate verification.

Security dependency chain: `2 → 3 → 4 → 5`.

Workstreams 6 and 8 may proceed independently after the baseline. Workstream 7 integrates after the required Core/evidence contracts are finalized. Documentation follows implementation, and final RC verification follows documentation.
