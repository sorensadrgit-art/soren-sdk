# Agent 2 Security Corpus Results

## Executed

- Phase 7 grant digest normalization and duplicate-ID behavior: PASS
- Provider-to-inventory identity mismatch: PASS
- Inventory substitution through description change: PASS
- UTF-8 response byte limit: PASS
- Kill switch and read-only classification: existing coverage PASS
- Phase 9 fabricated preparation: PASS
- Modified preparation after prepare: PASS
- Approval replay and approval integrity tampering: PASS
- Plan, project, policy, protected-branch, command, network, path, and approval-scope gates: PASS
- Partial failure reverse rollback: PASS
- Created-file removal, replace restoration, delete restoration, and strict final snapshot comparison: PASS
- Parent directory cleanup for directory absent in before snapshot: PASS
- Sandbox traversal, absolute path, NUL, symlink, and special-file corpus: package sandbox tests PASS

## Critical independent Phase 7 review findings

The independent review of `packages/core/src/context-gateway.ts` identified the following release blockers:

1. `RunGrant.digest` is deterministic but forgeable. A canonical `RunGrantStore` with opaque grant ID, immutable stored grant, active/revoked state, and atomic accounting is required.
2. Tool calls are synchronous and unbounded during dispatch. The provider port needs `AbortSignal`, deadline, per-grant max-call, and streaming/pre-materialization byte enforcement.
3. Tool input/output schema descriptors and validation are absent.
4. Protocol versions are not negotiated or bound to a session, and extensions are not bound to grants.
5. Remote project-content permission is a provider/tool self-attestation rather than an authority-bound permission/consent record.
6. Audit events are in-memory, unbounded, and miss failed provider calls. Replace them with a redacted durable sink port.
7. Context data needs an immutable untrusted-content envelope with no instruction authority. Source timestamps and inventory provenance/freshness need canonical validation.

These findings preserve, rather than weaken, the existing normalized-ID digest, provider identity, inventory description digest, UTF-8 measurement, kill switch, and read-only classification controls.

## Not yet complete, blocking ready status

- Grant call count, explicit revocation, gateway cancellation, negotiated protocol contract, schema descriptors, and remote project-content consent
- Live current project/policy/VCS/sandbox-policy provider recheck before first mutation
- Durable process-independent preparation and rollback recovery
- Concurrent approval reuse race under real persistence
- Resource-limit failure rollback under every sandbox adapter
- Cancellation race test with a real asynchronous boundary
- Fixture byte-for-byte unchanged assertion after every sandbox test
- Full explicit red-team corpus and a second full-suite pass

No uncontrolled host mutation, shell execution, package installation, network access, publication, deployment, protected-branch write, original-workspace write, or credential access was introduced by this branch.
