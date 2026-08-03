# Phase 7 Run-Grant Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Restore a buildable Phase 7 foundation after RED opaque-grant tests were merged without their production module.

**Architecture:** Add one canonical in-memory repository port and one `RunGrantStore`. Public handles contain only an opaque ID and are authorized only by the issuing store instance; canonical records remain readable after service restart, but old process handles are intentionally not portable.

**Tech Stack:** TypeScript 6, Vitest 4, existing `@soren-sdk/contracts` digest utilities, Node 24 CI.

## Global Constraints

- Work on `repair/phase7-run-grant-foundation`, never directly on `main`.
- Preserve existing gateway API during this repair.
- Do not add network, shell, credential, package-install, publishing, deployment, or project-mutation behavior.
- Keep new fields backward compatible for existing inventories.

### Task 1: Restore the missing production module

- [ ] Create `packages/core/src/run-grants.ts` with opaque handles, canonical records, repository port, issuance validation, authorization, and canonical reads.
- [ ] Reject copied, fabricated, unknown, cross-store, expired, revoked, and stale-inventory grants.
- [ ] Normalize and deduplicate tool IDs.

### Task 2: Bind grant records to reviewed inventory identity

- [ ] Add optional inventory extensions and input/output schemas to existing public types.
- [ ] Include extensions and schemas in `inventoryDigest`.
- [ ] Validate requested protocol and extensions during issuance.

### Task 3: Export and verify

- [ ] Export the grant module from `packages/core/src/index.ts`.
- [ ] Run exact-head CI and inspect every workflow step.
- [ ] Keep the PR unmerged until CI is green and review is complete.
