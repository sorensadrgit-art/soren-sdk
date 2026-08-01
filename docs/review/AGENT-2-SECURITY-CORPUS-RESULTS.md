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
