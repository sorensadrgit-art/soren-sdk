# Phase 8 Implementation Plan

## Task 1: Contract extensions and schemas

Add verification-plan, runner-result, and artifact-reference schemas. Extend existing execution and evidence contracts additively with snapshot bindings, semantic status, and verification data.

Acceptance criteria:
- New contracts validate via the central registry.
- Existing contract fixtures remain valid.
- New status values are explicit.

## Task 2: Planner and verification services

Create deterministic, pure planner and verification packages. Normalize equivalent input collections, reject secret-like strings, determine readiness, and report drift.

Acceptance criteria:
- Equivalent reordered input yields the same plan identity and digest.
- Missing input, policy denial, and duplicate checks produce deterministic non-ready outcomes.
- No command execution or project write dependency exists.

## Task 3: Runner-result evidence service

Create a pure evidence package that validates structured runner results, validates artifact digests, preserves failures, computes canonical evidence digests, and exposes stable summaries.

Acceptance criteria:
- Wrong-plan, fabricated-pass, bad-artifact, missing-evidence, redaction, and tampering cases fail closed.
- Result order does not affect evidence identity.
- Partial results remain partial.

## Task 4: Read-only CLI and documentation

Wire application services into `plan` and `evidence` CLI commands. Require explicit output paths for writes and atomically write only that output. Document the state matrix, data boundaries, and Phase 6/7/9 mappings.

Acceptance criteria:
- CLI inspect/check/verify/summarize commands have no project-write or command-execution behavior.
- Create requires `--output`.
- Docs explain outputs, integrity rules, and limitations.

## Task 5: Verification and delivery

Run focused package tests, repository tests, build, lint, typecheck, repository validation, and representative digest recomputation. Inspect the exact branch and staged diff, then publish a draft PR without merging.
