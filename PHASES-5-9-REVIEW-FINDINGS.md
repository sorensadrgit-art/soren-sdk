# Phases 5-9 Review Findings

Audited implementation SHA: `1e22f21c47cf387a9d646f0fc3c0ab5f2d0866c8`

## High

### H-01: Public test-only apply enablement defeats production export hardening

`packages/apply/src/index.ts` re-exports `./apply-service.js` and `./ports-fakes.js`. `apply-service.ts` contains a test-only capability and an exported `createApplyServiceForTesting` factory. Because the package export map exposes `dist/index.js`, consumers of the private workspace package can import the factory through the normal package surface and obtain mutation-capable behavior despite `APPLY_DISABLED` being true for the default factory.

`packages/sandbox/src/index.ts` also re-exports `./vcs-isolation-fakes.js` through its normal package entrypoint.

Impact: public test-only enablement and fake mutation-related capabilities remain reachable from production package entrypoints. This conflicts with the requested Phase 9 production export hardening and prevents a merge-ready security conclusion.

Required fix: move test-only factories/fakes under test-only paths excluded from `exports` and production barrels. Add an export-surface test proving they cannot be imported through `@soren-sdk/apply` or `@soren-sdk/sandbox`.

## Medium

### M-01: Required security corpus and dedicated protocol-equivalence execution are not runnable

`evaluations/phase-9-security/security-corpus.json` is present, but no package script or discovered test runner consumes it. The concurrency/recovery logic is covered inside apply tests, but no dedicated restart-recovery command was found. No dedicated protocol-surface equivalence command was found. A passing generic Vitest selection is not proof that these required corpus/surface checks executed.

Required fix: add explicit runnable scripts that consume the 31-case security corpus, exercise restart recovery, and assert public protocol/export surface equivalence; retain machine-readable results in CI.

## Low

None identified.

## Positive controls observed

- Default apply construction is explicitly disabled.
- Targeted apply, recovery, rollback, security, fixture, protocol and concurrency-related tests passed.
- No unrestricted runtime network call was found in package TypeScript source during the static audit.
- Filesystem mutation paths are concentrated in sandbox/apply boundaries and tests.

Decision: CHANGES REQUIRED.