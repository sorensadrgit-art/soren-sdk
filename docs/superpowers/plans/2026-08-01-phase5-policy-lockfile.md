# Phase 5 — Configuration, Policy Resolution, and Lockfile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic Soren project configuration (`.soren-sdk/config.{yaml,json}`), layered tighten-only policy resolution (`.soren-sdk/policy.{yaml,json}`), and reproducible `soren-sdk.lock` creation/validation — agent-neutral, with filesystem access behind adapters and memory-fixture unit tests.

**Architecture:** New `@soren-sdk/config` package with three provider-neutral services (`ConfigurationReader`, `PolicyResolver`, `LockfileService`) plus a `ResolvedPolicyProvider` integration port. Contract types and the `soren-config` / extended `soren-sdk-lock` schemas live in `@soren-sdk/contracts` + `schemas/`. The CLI gains read-only `config show` / `policy resolve` / `lock inspect` / `lock check` and an explicit atomic `lock create`.

**Tech Stack:** TypeScript 6 (ESM, NodeNext, strict + `exactOptionalPropertyTypes`), pnpm workspaces, Vitest, Ajv 2020-12 (existing `@soren-sdk/contracts` validator), `js-yaml@4.3.0` (safe JSON-schema parse with alias-bomb and prototype-key rejection), `node:crypto` SHA-256 via `@soren-sdk/contracts` digests.

## Global Constraints

- ESM `"type": "module"`, `NodeNext` module resolution, `.js` extensions on relative imports.
- TS strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`, `useUnknownInCatchVariables`.
- ESLint `typescript-eslint` recommended + `consistent-type-imports`, no `any`, no non-null assertion.
- Filesystem access only behind a `FileSystemAdapter`; unit tests use `MemoryFileSystem`.
- Parse every file as untrusted input: reject duplicate keys, alias bombs, `__proto__`/`constructor`/`prototype` keys, non-finite numbers, unknown fields (`additionalProperties: false`).
- If both YAML and JSON variants exist for the same purpose, reject with an ambiguity error — never silently choose.
- Policy resolution order: builtin → organization (caller) → workspace → project → run (caller). Lower layers may tighten but never weaken an inherited deny.
- Lockfile immutable digest excludes `generatedAt` and the digest field itself; equivalent reordered inputs produce identical digests (arrays sorted by stable key before hashing).
- Lockfile must never contain credentials, tokens, env values, raw project source, raw connector docs, or unnecessary absolute paths.
- CLI read commands never write. `lock create` requires `--output`, refuses symlink/path escapes, refuses overwrite without `--force`, writes atomically, and never creates unrelated files.
- Agent-neutral: no vendor/agent/model/user hardcoding; no duplicated routing or connector knowledge.
- Verification (DoD): `pnpm install --frozen-lockfile`, `pnpm --filter @soren-sdk/config test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm validate:repository`, `pnpm smoke:cli`.

---

### Task 1: Contracts — `SorenConfig` type, `soren-config.schema.json`, registry

**Files:**
- Modify: `packages/contracts/src/types/contracts.ts` (add `SorenConfig`)
- Create: `schemas/soren-config.schema.json`
- Modify: `packages/contracts/src/schemas/registry.ts` (add `"soren-config": "soren-config.schema.json"`)
- Modify: `packages/contracts/test/unit/validation.test.ts` (add fixture entry)
- Create: `packages/contracts/test/fixtures/valid/soren-config.json`
- Create: `packages/contracts/test/fixtures/invalid/soren-config-unknown-field.json`

**Interfaces:**
- Produces: `SorenConfig` type with `schemaVersion: "1.0.0-draft.1"`, `contractKind: "soren-config"`, `configId: string`, optional `preferences?: { preferredProviders?: string[]; forbiddenProviders?: string[]; maxProviders?: number }`. All optional list fields `uniqueItems: true`. `additionalProperties: false` everywhere. `maxProviders` integer >= 0.

- [ ] **Step 1:** Add `SorenConfig` to `contracts.ts`.
- [ ] **Step 2:** Add the schema file (mirror `policy.schema.json` style; Draft 2020-12, `$id` matching the raw github URL pattern).
- [ ] **Step 3:** Register in `registry.ts`; add valid + invalid fixtures; extend `validFixtures` in `validation.test.ts`.
- [ ] **Step 4:** Run `corepack pnpm --filter @soren-sdk/contracts test` → PASS; unknown-field fixture fails with `additionalProperties`.
- [ ] **Step 5:** Commit `feat(contracts): add soren-config contract and schema`.

### Task 2: Contracts — extend `SorenSdkLock` with Phase 5 bindings

**Files:**
- Modify: `packages/contracts/src/types/contracts.ts` (`SorenSdkLock`)
- Modify: `schemas/soren-sdk-lock.schema.json`
- Modify: `packages/contracts/test/fixtures/valid/soren-sdk-lock.json`
- Create: `packages/contracts/test/fixtures/invalid/soren-sdk-lock-route-drift.json`

**Interfaces:**
- `SorenSdkLock` gains (all required): `routePlanId: string`, `routePlanDigest: Digest`, `configDigest: Digest`, `unavailable: Array<{ id: string; reasonCode: string; reason: string }>`.
- `SorenSdkLock["connectors"][number]["integrations"][number]["versionStatus"]` enum gains `"unresolved"` (was `"not-applicable" | "resolved"`).
- `digest` remains the immutable digest (self-consistent in fixture via `computeLockDigest` later, but schema only pattern-checks).

- [ ] **Step 1:** Extend the type + schema (+ `routePlanId`/`routePlanDigest`/`configDigest`/`unavailable` required, `versionStatus` enum + `"unresolved"`).
- [ ] **Step 2:** Update the valid fixture with the new required fields and an `unavailable: []` entry.
- [ ] **Step 3:** Add invalid fixture missing `routePlanDigest`; add an `it.each` invalid case.
- [ ] **Step 4:** Run contracts tests → PASS (valid accepts, invalid rejects).
- [ ] **Step 5:** Commit `feat(contracts): bind route plan and config digest in lock contract`.

### Task 3: Scaffold `@soren-sdk/config` package + `js-yaml`

**Files:**
- Create: `packages/config/package.json`, `packages/config/tsconfig.json`, `packages/config/tsconfig.build.json`, `packages/config/src/index.ts` (empty barrel)
- Modify: root `pnpm-workspace.yaml` if needed (already `packages/*` — no change), `pnpm-lock.yaml` (via install)

**Interfaces:**
- `package.json`: `name: "@soren-sdk/config"`, `version: "0.1.0"`, `private`, `type: "module"`, `main/types/exports` → `./dist/index.js`/`.d.ts`, scripts `build`/`typecheck`/`test` mirroring `@soren-sdk/contracts`, deps `@soren-sdk/contracts: workspace:*` + `js-yaml: 4.3.0`, devDeps `@types/js-yaml`, `@types/node`, `typescript`, `vitest`.
- `tsconfig.json` extends repo `tsconfig.json` with `rootDir: "src"` etc. (mirror `packages/contracts/tsconfig.json`).

- [ ] **Step 1:** Create files; `corepack pnpm add --filter @soren-sdk/config js-yaml@4.3.0` (dev `@types/js-yaml`).
- [ ] **Step 2:** `corepack pnpm install` updates the lockfile; `corepack pnpm --filter @soren-sdk/config build` → PASS.
- [ ] **Step 3:** Commit `chore(config): scaffold @soren-sdk/config package`.

### Task 4: Safe parsing of untrusted YAML/JSON

**Files:**
- Create: `packages/config/src/parse.ts`
- Create: `packages/config/test/parse.test.ts`

**Interfaces:**
- `export class ConfigParseError extends Error { readonly code: "CONFIG_PARSE" | "CONFIG_UNSAFE_KEY" | "CONFIG_DUPLICATE_KEY" | "CONFIG_ALIAS"; readonly path: string; readonly details?: Record<string, unknown> }`
- `export function parseJsonText(text: string, source: string): JsonValue` — `JSON.parse`, then `rejectUnsafeKeys`.
- `export function parseYamlText(text: string, source: string): JsonValue` — `js-yaml` `load(text, { schema: JSON_SCHEMA, json: true, maxAliasCount: 0, filename: source })`, catch `YAMLException` → `CONFIG_PARSE`; reject duplicate keys via `onWarning` for `duplicated mapping key`; then `rejectUnsafeKeys`.
- `export function rejectUnsafeKeys(value: unknown, path = "$"): JsonValue` — recursive; throws `CONFIG_UNSAFE_KEY` for object keys `__proto__`, `constructor`, `prototype`; rejects `NaN`/`Infinity`; rejects non-plain objects and unsupported values.
- `export function asPlainObject(value: unknown): Record<string, unknown>` — throws `CONFIG_PARSE` if not a plain object.

**Tests (memory only):** valid YAML → object; valid JSON; `__proto__` key rejected at any depth; `constructor`/`prototype` keys rejected; alias bomb (`&a`/`*a` nesting) rejected (`CONFIG_ALIAS`); duplicate mapping key rejected; `NaN`/`.inf` rejected; invalid syntax → `CONFIG_PARSE` with source path; non-object top-level rejected.

- [ ] **Step 1:** Write failing tests; run → FAIL (module missing).
- [ ] **Step 2:** Implement `parse.ts`.
- [ ] **Step 3:** Run tests → PASS.
- [ ] **Step 4:** Commit `feat(config): safe untrusted YAML/JSON parsing`.

### Task 5: `FileSystemAdapter` (memory + node) and config file discovery

**Files:**
- Create: `packages/config/src/adapters/filesystem.ts`, `packages/config/src/adapters/index.ts`
- Create: `packages/config/src/discovery.ts`
- Create: `packages/config/test/discovery.test.ts`

**Interfaces:**
- `export interface FileSystemAdapter { readFile(path: string): string | undefined; exists(path: string): boolean; realpath(path: string): string; isSymbolicLink(path: string): boolean; writeFileAtomic(path: string, content: string): void }`
- `export class NodeFileSystem implements FileSystemAdapter` — wraps `node:fs` (`readFileSync` catch ENOENT → undefined; `realpathSync.native`; `lstatSync().isSymbolicLink()`; `writeFileAtomic` = write temp `path + ".tmp-<pid>-<rand>"` in same dir then `renameSync`, no `mkdir`).
- `export class MemoryFileSystem implements FileSystemAdapter` — in-memory `Map<string, string>`; `realpath` resolves `..`/`.` lexically, throws `ENOENT` when missing; `isSymbolicLink` false; `writeFileAtomic` sets the map entry; optional `symlinks` set to simulate link targets.
- `export interface ConfigFileKinds { config: "config"; policy: "policy" }` helpers:
  - `export function sorenConfigPaths(root: string): Array<{ kind: "config"; format: "json" | "yaml"; path: string }>` → `.soren-sdk/config.yaml` + `.soren-sdk/config.json`.
  - `export function sorenPolicyPaths(root: string): Array<{ kind: "policy"; format: "json" | "yaml"; path: string }>` → `.soren-sdk/policy.yaml` + `.soren-sdk/policy.json`.
  - `export function findSingleSource(fs: FileSystemAdapter, candidates: ...): { format; path } | undefined` — if both variants exist → throw `CONFIG_AMBIGUOUS`; else return the one present.

**Tests:** discovery returns yaml when only yaml; json when only json; throws `CONFIG_AMBIGUOUS` when both; missing → undefined; `MemoryFileSystem` read/exists/write/symlink behaviors; `NodeFileSystem` atomic write leaves no temp file and overwrites via rename.

- [ ] **Step 1:** Write failing tests (discovery + memory fs).
- [ ] **Step 2:** Implement adapters + discovery.
- [ ] **Step 3:** Run tests → PASS.
- [ ] **Step 4:** Commit `feat(config): filesystem adapters and file discovery`.

### Task 6: `ConfigurationReader` — load project config + policy layers

**Files:**
- Create: `packages/config/src/configuration.ts`
- Create: `packages/config/test/configuration.test.ts`

**Interfaces:**
- `export interface LoadedConfiguration { config: SorenConfig; digest: Digest; source: { format: "json" | "yaml"; path: string } }`
- `export interface PolicyLayer { document: PolicyDocument; source: { scope: PolicyDocument["scope"]; format: "json" | "yaml"; path: string } }`
- `export interface ConfigurationReaderOptions { fs: FileSystemAdapter; workspaceRoot?: string }`
- `export class ConfigurationReader implements ConfigurationReaderPort`:
  - `loadProjectConfig(projectRoot: string): LoadedConfiguration` — discover `.soren-sdk/config.{yaml,json}` (ambiguity → throw); parse; `validateContract<SorenConfig>("soren-config", value)` (throws `CONFIG_INVALID` with issues); normalize (stable-unique sort lists, drop undefined optionals); `digest = digestJson(config)`.
  - `loadPolicyLayers(projectRoot: string): PolicyLayer[]` — project layer from `<projectRoot>/.soren-sdk/policy.{yaml,json}`; workspace layer from first ancestor (walking up, excluding projectRoot, up to `workspaceRoot` if given) with a policy file; each validated as `PolicyDocument` via `validateContract("policy", ...)`; order `[workspace?, project?]` (builtin + org + run are added by the resolver).
- `export type ConfigurationReaderPort = Pick<ConfigurationReader, "loadProjectConfig" | "loadPolicyLayers">`

**Tests (MemoryFileSystem fixtures):** valid yaml config loads + digest stable; valid json config loads; ambiguity throws; unknown field throws `CONFIG_INVALID`; prototype-pollution-shaped config rejected at parse; policy project layer loads; workspace layer discovered from ancestor; both project+workspace returned in order; no files → project config throws `CONFIG_NOT_FOUND` (documented) and layers returns `[]`; reordered preference arrays produce identical digest.

- [ ] **Step 1:** Write failing tests.
- [ ] **Step 2:** Implement `configuration.ts`.
- [ ] **Step 3:** Run tests → PASS.
- [ ] **Step 4:** Commit `feat(config): configuration reader with memory fixtures`.

### Task 7: `PolicyResolver` — layered tighten-only resolution

**Files:**
- Create: `packages/config/src/policy.ts`
- Create: `packages/config/test/policy.test.ts`

**Interfaces:**
- `export type PolicyScope = "builtin" | "organization" | "workspace" | "project" | "run"`
- `export interface ResolvePolicyInput { projectRoot: string; fs: FileSystemAdapter; organizationPolicy?: PolicyDocument; runPolicy?: PolicyDocument; workspaceRoot?: string }`
- `export interface PolicyDecision { field: string; value: boolean | number | string | string[]; reasonCode: string; layer: PolicyScope; sourcePolicyId: string | null; inheritedDeny: boolean }`
- `export interface ResolvedPolicy { snapshotId: Digest; document: PolicyDocument; effective: PolicyDocument["rules"]; decisions: PolicyDecision[]; layers: Array<{ scope: PolicyScope; policyId: string | null; source: string | null }> }`
- `export const BUILTIN_POLICY: PolicyDocument` — hard safety baseline (documented below).
- `export class PolicyResolver implements PolicyResolverPort { resolve(input: ResolvePolicyInput): ResolvedPolicy }`
- `export type PolicyResolverPort = Pick<PolicyResolver, "resolve">`

**Resolution rules (tighten-only):**
1. Layer order: builtin → organization (caller) → workspace → project → run (caller). Missing layers are skipped.
2. `allowedConnectors` / `allowedLicenses` (allowlists): effective = the highest layer's non-empty allowlist, narrowed by every lower non-empty allowlist (subset). A lower layer may only *remove* items; attempting to *add* an item not present in the inherited allowlist → `POLICY_WEAKENING_DENIED`.
3. `deniedConnectors` (and denies generally): union across all layers. A deny from any higher layer is inherited — an allowlist entry for a denied connector is stripped from the effective set (`inheritedDeny: true`); a lower layer adding a denied connector back to an allowlist → `POLICY_WEAKENING_DENIED`.
4. Booleans: `allowExperimental`, `allowPaidServices`, `allowRemoteProjectContent` may only tighten true→false (once false, setting true → weakening error). `requireReducedMotion` may only tighten false→true.
5. `network.mode` tighten order `unrestricted → allowlist → deny`; `network.allowedHosts` subset-only (and non-empty allowedHosts requires `allowlist` mode).
6. `filesystem.read`/`write` subset-only (write may only shrink).
7. `maxBundleKilobytes`: lower layer may only decrease (or keep); increasing → weakening error.
8. `requiredApprovals`: lower layers may only ADD scopes (union); removing an inherited scope → weakening error.
9. Every field change records a `PolicyDecision` with `reasonCode` (e.g. `POLICY_TIGHTEN`, `POLICY_DENY_INHERITED`, `POLICY_SOURCE_BUILTIN`, `POLICY_SOURCE_ORG`, `POLICY_SOURCE_WORKSPACE`, `POLICY_SOURCE_PROJECT`, `POLICY_SOURCE_RUN`) and `layer` + `sourcePolicyId`.
10. `snapshotId = digestJson(document)` where `document` is the normalized resolved `PolicyDocument` (scope `"run"`, policyId `resolved-<digest-prefix>`, lists stable-sorted).

**Builtin (hard safety, provider-neutral):** `allowedConnectors: []`, `deniedConnectors: []`, `allowExperimental: false`, `allowedLicenses: []`, `allowPaidServices: false`, `network: { mode: "deny", allowedHosts: [] }`, `filesystem: { read: [], write: [] }`, `allowRemoteProjectContent: false`, `maxBundleKilobytes: null`, `requireReducedMotion: true`, `requiredApprovals: []`. Empty allowlists mean "no allow constraint at this layer" (deny-by-default at the end).

**Tests:** layer precedence; builtin baseline; org adds deny → project cannot re-allow; lower-layer allow expansion rejected; experimental/paid/remote-content true→false tightening allowed and false→true rejected; network mode tightening allowed and loosening rejected; allowedHosts subset-only; filesystem write shrink allowed / grow rejected; maxBundleKilobytes decrease allowed / increase rejected; requiredApprovals add-only; provenance `decisions` populated with layer + reasonCode + inheritedDeny; deterministic `snapshotId`; identical inputs (reordered layers lists, reordered allowlist entries) → identical snapshot.

- [ ] **Step 1:** Write failing tests (all rule categories).
- [ ] **Step 2:** Implement `policy.ts`.
- [ ] **Step 3:** Run tests → PASS.
- [ ] **Step 4:** Commit `feat(config): layered tighten-only policy resolver`.

### Task 8: `ResolvedPolicyProvider` integration port + `INTEGRATION-NOTES.md`

**Files:**
- Create: `packages/config/src/resolved-policy-provider.ts`
- Create: `packages/config/test/resolved-policy-provider.test.ts`
- Create: `packages/config/INTEGRATION-NOTES.md`

**Interfaces:**
- `export interface ResolvedPolicyProvider { getResolvedPolicy(input: ResolvePolicyInput): ResolvedPolicy }`
- `export class MemoryResolvedPolicyProvider implements ResolvedPolicyProvider` — preloaded `Map<Digest, ResolvedPolicy>` keyed by input fingerprint (digest of `projectRoot` + optional org/run policy ids); throws `POLICY_SNAPSHOT_MISSING` when unknown. Parallel phases consume this port without importing filesystem loaders.
- `INTEGRATION-NOTES.md` documents the port, the future mapping to Phases 6–9 (REST/MCP/Typescript SDK surfaces consume `ResolvedPolicyProvider`; Phase 8 evidence binds `snapshotId`), and every temporary assumption (workspaceRoot discovery, builtin allowlist semantics, config preference shape).

**Tests:** provider returns preloaded policy for known fingerprint; throws for unknown; interface is importable without `node:fs` side effects (import the module in a vitest and assert no fs adapter needed).

- [ ] **Step 1:** Write failing tests.
- [ ] **Step 2:** Implement provider + notes.
- [ ] **Step 3:** Run tests → PASS.
- [ ] **Step 4:** Commit `feat(config): resolved policy provider integration port`.

### Task 9: `LockfileService` — create / validate / compare

**Files:**
- Create: `packages/config/src/lockfile.ts`
- Create: `packages/config/test/lockfile.test.ts`

**Interfaces:**
- `export interface SelectedConnector { id: string; connectorVersion: string; digest: Digest; integrations: Array<{ id: string; versionStatus: "not-applicable" | "resolved" | "unresolved"; version?: string; digest?: string }> }`
- `export interface CreateLockfileInput { projectSnapshotId: Digest; catalogSnapshotId: Digest; policySnapshotId: Digest; configDigest: Digest; routePlanId: string; routePlanDigest: Digest; capabilityOntologyVersion: string; connectors: SelectedConnector[]; unavailable: Array<{ id: string; reasonCode: string; reason: string }>; generatedAt?: string }`
- `export interface LockValidationResult { ok: true; lock: SorenSdkLock } | { ok: false; issues: string[] }`
- `export interface LockDriftReport { inSync: boolean; drifts: Array<{ field: string; locked: string | undefined; current: string | undefined; severity: "critical" | "warning" | "info" }> }`
- `export class LockfileService { create(input: CreateLockfileInput): SorenSdkLock; validate(lock: unknown): LockValidationResult; compare(lock: SorenSdkLock, current: CurrentResolutionInputs): LockDriftReport }`
- `export interface CurrentResolutionInputs { projectSnapshotId: Digest; catalogSnapshotId: Digest; policySnapshotId: Digest; configDigest: Digest; routePlanId: string; routePlanDigest: Digest }`
- `export function computeLockDigest(lock: Omit<SorenSdkLock, "digest">): Digest` — `digestJson` of the normalized lock with `generatedAt` removed; arrays sorted by stable key (connectors by id, integrations by id, protocol/runtime by name, unavailable by id). Export for independent recomputation in tests.

**Behavior:**
- `create` normalizes (stable-sorts arrays), binds all inputs, sets `generatedAt` (input or now), computes `digest` via `computeLockDigest` (which excludes `generatedAt` and the digest field). Reordered inputs → identical lock + digest. Credential-like values (keys matching `/token|secret|password|credential|api[_-]?key|authorization/i`) in any input string → `LOCK_CREDENTIAL_REJECTED`. Absolute paths rejected.
- `validate` uses `validateContract<SorenSdkLock>("soren-sdk-lock", lock)` and re-checks `digest` consistency (recompute from the parsed lock minus digest; mismatch → `digest-mismatch` issue). Tampering with any bound field → failure.
- `compare` compares each bound digest/id (`projectSnapshot`, `catalogSnapshot`, `policySnapshot`, `config`, `routePlan`) between lock and current; connector/integration presence drift (locked set vs current set) → `warning`; any snapshot/route/digest mismatch → `critical`; missing connector or integration → `critical` for connectors missing from current resolution. `inSync` true only when zero `critical` drifts.

**Tests:** deterministic lock (same input → same digest); reordered connectors/integrations/unavailable → identical digest; tampered digest → validate fails; tampered bound field → validate fails (`digest` mismatch); drift on each of project/catalog/policy/config/route → critical + `inSync false`; missing connector in current → critical; missing integration → warning; credential-like input rejected; absolute path rejected; `generatedAt` variation does not change digest; `computeLockDigest` independently recomputed in test equals lock.digest.

- [ ] **Step 1:** Write failing tests.
- [ ] **Step 2:** Implement `lockfile.ts`.
- [ ] **Step 3:** Run tests → PASS.
- [ ] **Step 4:** Commit `feat(config): deterministic lockfile service`.

### Task 10: CLI commands + formatting + atomic write

**Files:**
- Modify: `packages/cli/package.json` (add `@soren-sdk/config` dep)
- Modify: `packages/cli/src/run.ts` (dispatch + parsers + wiring)
- Create: `packages/cli/src/config-options.ts`, `packages/cli/src/policy-options.ts`, `packages/cli/src/lock-options.ts` (small parse helpers, mirroring `route-options.ts`)
- Modify: `packages/cli/src/format.ts` (human formatters: `formatLoadedConfig`, `formatResolvedPolicy`, `formatLock`, `formatDrift`)
- Create: `packages/cli/test/config-cli.test.ts`, `packages/cli/test/policy-cli.test.ts`, `packages/cli/test/lock-cli.test.ts`

**Commands (all in `runCli`):**
- `config show [--project <path>] [--json]` — read-only; loads config; human summary or JSON `{ config, digest, source }`.
- `policy resolve [--project <path>] [--json]` — read-only; builds `ResolvePolicyInput` (fs = `NodeFileSystem`, workspaceRoot = walk-up discovery), resolves, prints summary or JSON `ResolvedPolicy`.
- `lock inspect [path] [--json]` — read-only; `validate` a lock file; human summary or JSON `LockValidationResult` (exit 1 on invalid).
- `lock check [path] [--project <path>] [--json]` — read-only; validates lock, computes current inputs (project snapshot via `inspectProject` from `@soren-sdk/core`, catalog snapshot via `FileSystemConnectorCatalog`, policy snapshot via resolver, config digest via reader; route plan from optional `--route-plan <path>` else routePlanId empty + digest of `""`), prints `LockDriftReport`; exit 1 when drift critical.
- `lock create --project <path> --output <path> [--route-plan <path>] [--force] [--json]` — write; requires `--output` (else exit 2); computes same current inputs (route plan REQUIRED via `--route-plan <path>`; missing → exit 2); refuses symlink output and any symlinked path component; refuses `..` escape; refuses overwrite without `--force`; writes via `NodeFileSystem.writeFileAtomic`; prints JSON of created lock (or human summary). Exit 1 on policy/validation errors; 2 on usage errors.

**Tests:** no-write verification for all four read commands (temp project dir; assert `readdir` unchanged); `config show` human+JSON; `policy resolve` human+JSON + weaken error path; `lock inspect` valid/invalid/tampered; `lock check` in-sync and drift (critical → exit 1); `lock create` happy path (atomic, file created), missing `--output` → 2, existing output without `--force` → refuses, with `--force` overwrites, symlink output path refused, traversal `../` refused, credential-like input rejected, no unrelated files created.

- [ ] **Step 1:** Write failing CLI tests.
- [ ] **Step 2:** Implement options/format/run wiring.
- [ ] **Step 3:** Run `corepack pnpm --filter @soren-sdk/cli test` → PASS.
- [ ] **Step 4:** Commit `feat(cli): config, policy, and lockfile commands`.

### Task 11: Fixtures, `smoke:cli`, CI paths

**Files:**
- Create: `packages/cli/test/fixtures/config-project/.soren-sdk/config.yaml`, `.soren-sdk/policy.yaml`, `route-plan.json`, `soren-sdk.lock`
- Modify: root `package.json` (`smoke:cli` additions)
- Modify: `.github/workflows/contracts-ci.yml` (add `packages/config/**`, `evaluations/**`, `docs/superpowers/**` trigger paths)

**Fixture:** `config.yaml` with preferences; `policy.yaml` a valid tightening project policy; `route-plan.json` a valid `RoutePlan` (use a snapshot of the route plan contract shape); `soren-sdk.lock` a valid lock consistent with the fixture inputs (digest computed via `computeLockDigest`).

**Smoke additions (appended to existing `smoke:cli`):**
```
node packages/cli/dist/bin.js config show --project packages/cli/test/fixtures/config-project --json
node packages/cli/dist/bin.js policy resolve --project packages/cli/test/fixtures/config-project --json
node packages/cli/dist/bin.js lock inspect packages/cli/test/fixtures/config-project/soren-sdk.lock --json
node packages/cli/dist/bin.js lock check packages/cli/test/fixtures/config-project/soren-sdk.lock --project packages/cli/test/fixtures/config-project --json
node packages/cli/dist/bin.js lock create --project packages/cli/test/fixtures/config-project --route-plan packages/cli/test/fixtures/config-project/route-plan.json --output "$(mktemp -d)/soren-sdk.lock" --force --json
```

- [ ] **Step 1:** Create fixtures (lock digest via a one-off `node -e` using the built service).
- [ ] **Step 2:** Update `smoke:cli` + CI paths.
- [ ] **Step 3:** Run `corepack pnpm smoke:cli` → PASS.
- [ ] **Step 4:** Commit `test(cli): phase 5 fixtures, smoke, and CI paths`.

### Task 12: Documentation + evaluations

**Files:**
- Create: `docs/CONFIGURATION.md`, `docs/POLICY-RESOLUTION.md`, `docs/LOCKFILE.md`
- Create: `evaluations/phase-5-policy/README.md`, `evaluations/phase-5-policy/adversarial-cases.json`

**Content:** `CONFIGURATION.md` (files, formats, ambiguity, untrusted parsing, configId/preferences, digest). `POLICY-RESOLUTION.md` (layer order, tighten-only rules table, provenance/decisions, snapshot). `LOCKFILE.md` (bindings, immutable digest, no-credential rule, CLI usage, drift semantics). Evaluation JSON mirrors `phase-4-routing.json` shape (`schemaVersion`, `cases`) with adversarial policy cases (weakening, YAML confusion, unknown field, prototype pollution, path/symlink escape, credential inclusion, lock tampering, digest instability).

- [ ] **Step 1:** Write docs.
- [ ] **Step 2:** Write evaluation cases.
- [ ] **Step 3:** Commit `docs(phase5): configuration, policy resolution, lockfile; evaluations`.

### Task 13: Full verification, security audit, draft PR

- [ ] **Step 1:** `corepack pnpm install --frozen-lockfile` → clean.
- [ ] **Step 2:** `corepack pnpm --filter @soren-sdk/config test` → all pass.
- [ ] **Step 3:** `corepack pnpm lint` → 0 errors.
- [ ] **Step 4:** `corepack pnpm typecheck` → 0 errors.
- [ ] **Step 5:** `corepack pnpm test` → all packages pass.
- [ ] **Step 6:** `corepack pnpm build` → exit 0.
- [ ] **Step 7:** `corepack pnpm validate:repository` → 0 errors.
- [ ] **Step 8:** `corepack pnpm smoke:cli` → exit 0.
- [ ] **Step 9:** Adversarial security audit (credential logging, unsafe parsing, path traversal, hidden writes, network access, subprocess execution) — grep + code review; record findings.
- [ ] **Step 10:** Push branch; open draft PR to `main` (unmerged). Write handoff summary.

---

## Self-Review

**Spec coverage:** every spec bullet maps to Tasks 1–13 (config files/ambiguity/parsing → 4–6; policy layers/weakening/provenance/coverage list → 7; lockfile bindings/digest/credential rules → 2, 9; CLI commands/no-write/atomic → 10, 11; tests list → 4–10; parallel port + notes → 8; docs → 12; verification + security + PR → 13).

**Placeholder scan:** none — every step names concrete files, interfaces, rule semantics, and test names.

**Type consistency:** `SorenConfig`, extended `SorenSdkLock`, `ResolvedPolicy`, `PolicyDecision`, `LockDriftReport`, `CurrentResolutionInputs` are defined once (Tasks 1, 2, 7, 9) and consumed by later tasks with matching names/signatures.
