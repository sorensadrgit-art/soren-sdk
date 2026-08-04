# Mainline repair baseline

**Captured:** 2026-08-04

**Purpose:** Fresh, isolated reproduction before production-code changes.

## Identity and environment

| Item | Value |
|---|---|
| Remote base | `origin/main` |
| Starting SHA | `832d4ef2a8a576c15d36bf196bfbfb6f2fa7062e` |
| Repair branch | `repair/mainline-release-gates` |
| Node | `v24.18.1` |
| pnpm | `11.17.0` |
| TypeScript | `6.0.3` |
| Vitest | `4.1.10` |

The requested `corepack enable` and `corepack prepare pnpm@11.17.0 --activate` could not run because the installed Corepack wrapper resolves `C:\c\Program Files\nodejs\node_modules\corepack\dist\corepack.js`, which is absent at that incorrectly converted path. `npm exec --package=pnpm@11.17.0 -- pnpm ...` was used as a non-repository fallback and reported pnpm `11.17.0` for every recorded package-manager command.

The prior checkout was the explicitly excluded `review/phases-5-9-master-antigravity` worktree at `113f779c91076d08d66637169e07f99bb649ccf5`, with unrelated modified and untracked files. It was not altered. The repair worktree was created directly from fetched `origin/main`.

## Root command results

| Command | Exit | Result |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 0 | PASS |
| `pnpm lint` | 0 | PASS |
| `pnpm typecheck` | 2 | FAIL: Core test compilation imports a missing `negotiateProtocol` export and passes unsupported `protocolVersion` to the legacy grant shape. |
| `pnpm test` | 1 | FAIL: recursive runner stopped at Core. |
| `pnpm build` | 0 | PASS |
| `pnpm validate:repository` | 0 | PASS WITH 4 WARNINGS: Lenis, React Three Fiber, shadcn, and Storybook are legacy manifests. |
| `pnpm smoke:cli` | 1 | FAIL: stale checked-in lock is compared to current catalog/project inputs before a fresh temporary lock is created. |
| `pnpm audit --prod` | 1 | FAIL: one high advisory, `fast-uri >=3.0.0 <3.1.5`, via `packages__contracts>ajv>fast-uri` and `packages__contracts>ajv-formats>ajv>fast-uri`. |
| `git diff --check` | 0 | PASS before baseline artifact creation |

## Independent package reproduction

The task prompt's `@file:soren-sdk/<package>` filter is invalid in this checkout. It returns `No projects matched the filters` with exit 0, so it is not evidence of a package test. The replacement command was `pnpm --filter @soren-sdk/<package> <script>`.

| Package | Typecheck | Tests |
|---|---:|---:|
| Contracts | 0 | 37/37 |
| Config | 0 | 75/75 |
| Core | 2 | 153/156, 3 failed |
| Planner | 0 | 2/5, 3 failed |
| Sandbox | 0 | 48/49, 1 failed |
| Apply | 0 | 29/29 |
| Connectors | 0 | 23/23 |
| Verification | 0 | 1/1 |
| Evidence | 0 | 2/5, 3 failed |
| Application | 0 | 2/2 |
| Protocol Server | 0 | 7/7 |
| CLI | 0 | 33/40, 7 failed |
| SDK | 0 | 2/2 |

**Fresh aggregate:** 414 passed, 17 failed, 431 total.

## Failure-to-root-cause map

| Surface | Reproduced failure | Verified current cause | Repair constraint |
|---|---|---|---|
| CI | Package-only changes to Application, Apply, Planner, Evidence, Protocol Server, Sandbox, SDK, or Verification can skip the workflow. The workflow has no audit step. | `.github/workflows/contracts-ci.yml` uses narrow `paths` lists for PR and push triggers, names the job `contracts`, and ends after CLI smoke. | Use full-repository PR and main-push gates, immutable action pins, least-privilege permissions, cancellation concurrency, and no `continue-on-error`. |
| Core Phase 7 | `negotiateProtocol is not a function`; typecheck also rejects `protocolVersion` on `Omit<RunGrant, "digest">`; malformed input is accepted. | `context-gateway.ts` contains the older caller-portable digest-bearing `RunGrant`, has no `negotiateProtocol`, no schema validation, synchronous provider calls, and only a fixed response limit. `run-grants.ts` separately defines an opaque handle but relies on a process-local `WeakMap` and is not authoritative to the gateway. | Replace duplicate authority with one stored canonical grant model. Preserve deny-by-default, current-inventory binding, strict schemas, quotas, cancellation, consent, and redacted audit. |
| CLI route | Seven `route` tests fall into usage handling, all route outcomes exit 2, and route-specific errors are not emitted. | `packages/cli/src/run.ts` imports no route parser, request builder, router, or route formatter, and has no `domain === "route"` dispatch. | Restore read-only native-first route execution, canonical JSON and stable human output, correct valid/invalid exits, and one `ROUTE_INPUT_INVALID` prefix. |
| CLI smoke | Smoke fails at `lock check` before proving a newly-created lock can be inspected and checked. | Root `smoke:cli` is a shell chain that checks a permanently checked-in fixture whose project and catalog snapshot digests have drifted. | Replace it with a cross-platform Node script that creates, inspects, checks, and deletes a fresh temporary lock. |
| Planner | Ordinary drift comparison throws `Value is not valid JSON`; security wording differs. | `compare()` always includes `lockfile: undefined` and `runnerCapabilities: undefined`, then sends those records through canonical JSON. The secret scanner says `Sensitive-looking data is forbidden...` instead of the cross-package `Secret-like data is forbidden...` phrase. | Omit absent fields with conditional spreads on both sides, preserve `null` semantics, and add normalization regressions. |
| Evidence | Ingestion accepts a required passed result with no artifact. Verification accepts a forged `evidenceId` and forged `unverified` list after digest recomputation. | `ingest()` only rejects a passed check if no runner result exists, not if its artifact list is empty. `verify()` recomputes only the digest and does not validate digest-derived identity, canonical required-check state, duplicate IDs, allowed states, or full artifact structure. | Require runner-originated proof for required passes and derive identity and unverified state from verified semantic data. |
| Sandbox | `TempDirSandboxSession.write("fifo", ...)` overwrites a FIFO instead of rejecting it. | Pre-write candidate validation examines the existing FIFO, but `write()` then proceeds to a sibling temp file and rename without revalidating the destination at the mutation boundary. | Recheck the target immediately before rename and fail closed on special files. Do not weaken this security regression. |
| Production dependencies | `pnpm audit --prod` reports one high advisory. | pnpm resolves vulnerable `fast-uri@3.1.4` through AJV. | Resolve through the smallest compatible normal dependency update or a narrowly justified override. Do not suppress audit output. |
| Connector validation | Four legacy-manifest warnings. | `sdk-connectors/{lenis,react-three-fiber,shadcn,storybook}/sdk.manifest.json` have not been migrated to Schema v2. | Use current official sources and validate seven total Schema v2 connectors with no legacy warnings. |
| Application and protocol surfaces | Existing narrow tests pass but do not prove the requested real service equivalence or deny-by-default remote project-root authorization. | Baseline test coverage does not exercise the required full default composition and equivalence requirements. Production implementation must be inspected and strengthened after the Core canonical model is stable. | Do not treat the passing baseline tests as proof that fake defaults, root authorization, or surface equivalence are acceptable. |
| Apply Phase 9 | Existing tests pass but are in-memory only and cannot prove restart-safe exact-once approval or rollback recovery. | The baseline needs architecture inspection after Phase 4, 7, and 8 stabilization; passing current unit tests are not durable-store evidence. | Keep Apply disabled at its public package boundary while durable stores, recovery, and restart tests are added. |

## Historical branches

The following branches were inspected only as historical source material and will not be merged or wholesale cherry-picked:

| Branch | Remote state | Why not mergeable |
|---|---|---|
| `worker/phase9-recovery-hardening` | exists at `e164371f24679996c700287f0505998f74f3675b` | Diverges from current main and predates the current contracts. |
| `review/phase9-durable-recovery-codex` | not present in current remote heads | No remote reference exists to establish a reviewed ancestry. |
| `review/phase9-durability-completion` | exists at `c76fd63b30e8d76756d20d46a52ec95a649f5669` | Historical review branch, not validated against the fresh main contracts. |
| `review/phases-5-9-master-antigravity` | exists remotely at `a55bd1b7379298af3a43ce1671551479f808a780` and was the stale local checkout | Local copy had unrelated uncommitted changes and a different head. It conflicts with the required clean-main integration approach. |

`626f5f7a73e4bfcfce1c74dc70ec535930f838bf` is available in the local object database but no longer has a remote ref. It may be inspected read-only for the route restoration only.

## Security boundaries that remain required

- Apply must remain disabled from the production package boundary.
- No production export may disclose Apply test enablement, shell execution, broad filesystem access, credentials, or unrestricted network access.
- Authorization cannot accept a caller-authored mutable grant payload or rely solely on process-local object identity.
- Remote project-content tools require current explicit consent and project-root authorization must deny by default.
- Tool schemas must reject unsafe keys and non-JSON values, and audit output must remain redacted.
- Evidence must require runner proof for required passes and be tamper-resistant for digest, ID, and required-check state.
- Sandbox special files, traversal, symlink escape, and mutation-boundary TOCTOU checks remain hard security gates.

## Next gated actions

1. Commit this baseline artifact without production changes.
2. Restore CI authority.
3. Restore the CLI route vertical slice and replace the smoke runner.
4. Repair Planner, Evidence, and the independently reproduced Sandbox security regression before beginning durable Apply work.
5. Reconcile the Core gateway/grant architecture before application composition and Phase 9 durability.
