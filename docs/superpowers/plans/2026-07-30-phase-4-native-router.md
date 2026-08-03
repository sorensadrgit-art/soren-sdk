# Phase 4 Native-First Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Soren SDK's first deterministic capability router for Web Platform, Motion, and GSAP, producing contract-valid content-addressed `RoutePlan` records from explicit structured capability requests.

**Architecture:** Complete the three provider connectors first so the router consumes the same approved catalog data exposed everywhere else. Add a pure provider-neutral router inside `@soren-sdk/core`; it validates contracts, applies an immutable read-only policy, builds eligible claims, enumerates the tiny provider-set space, enforces environment and ownership constraints, ranks valid routes deterministically, and emits a stable `RoutePlan`. The CLI remains a thin adapter that inspects a project and converts explicit flags into a `RouteRequest`.

**Tech Stack:** Node.js 24, TypeScript 6, pnpm 11.17.0, Vitest 4, JSON Schema Draft 2020-12, existing `@soren-sdk/contracts`, `@soren-sdk/core`, `@soren-sdk/connectors`, and `@soren-sdk/cli` packages. No new runtime dependency is permitted.

## Global Constraints

- Providers are limited to `web-platform`, `motion`, and `gsap`.
- Motion runtime baseline is `motion@12.42.2`, React import `motion/react`, MIT license, React prerequisite `18.2+` for React-specific claims.
- GSAP runtime baseline is `gsap@3.15.0`, core import `gsap`, ScrollTrigger import `gsap/ScrollTrigger`, license `LicenseRef-GSAP-Standard`.
- Capability input is explicit; no natural-language extraction.
- No package installation, subprocesses, shell execution, network access, MCP/Skill invocation, code generation, or project mutation.
- Only healthy, approved/stable, selectable Connector Manifest v2 records may enter candidate generation.
- Built-in policy denies network, project writes, commands, remote project content, paid services, and experimental connectors.
- Native claims do not consume a third-party provider slot and never appear in `selectedProviders`.
- Required capabilities must be fully covered; optional unsupported capabilities may be omitted.
- Same explicit scope/property cannot have two exclusive providers.
- Route decisions are independent of request capability order, catalog enumeration order, creation time, and clone path.
- Every behavior begins with a failing test.
- Permanent CI retains frozen lockfile, pinned Actions, Node.js 24, and `contents: read`.

---

## File Structure

```text
sdk-connectors/
├── web-platform/
│   ├── sdk.manifest.json
│   ├── SKILL.md
│   ├── docs.sources.json
│   ├── compatibility.json
│   └── evaluations/route-cases.json
├── motion/
│   ├── sdk.manifest.json
│   ├── SKILL.md
│   ├── docs.sources.json
│   ├── compatibility.json
│   └── evaluations/route-cases.json
└── gsap/
    ├── sdk.manifest.json
    ├── SKILL.md
    ├── docs.sources.json
    ├── compatibility.json
    └── evaluations/route-cases.json

packages/core/src/router/
├── types.ts
├── policy.ts
├── semver.ts
├── candidates.ts
├── ownership.ts
├── rank.ts
├── explain.ts
└── route-capabilities.ts

packages/core/test/router/
├── fixtures.ts
├── policy.test.ts
├── candidates.test.ts
├── ownership.test.ts
├── route-capabilities.test.ts
└── metamorphic.test.ts

packages/cli/src/
├── route-options.ts
├── run.ts
└── format.ts

packages/cli/test/
└── route-cli.test.ts

evaluations/
└── phase-4-routing.json
```

---

### Task 1: Complete Web Platform, Motion, and GSAP Connector Manifest v2 records

**Files:**
- Modify: `sdk-connectors/web-platform/sdk.manifest.json`
- Create: `sdk-connectors/web-platform/SKILL.md`
- Create: `sdk-connectors/web-platform/docs.sources.json`
- Create: `sdk-connectors/web-platform/compatibility.json`
- Create: `sdk-connectors/web-platform/evaluations/route-cases.json`
- Replace: `sdk-connectors/motion/sdk.manifest.json`
- Create: `sdk-connectors/motion/SKILL.md`
- Create: `sdk-connectors/motion/docs.sources.json`
- Create: `sdk-connectors/motion/compatibility.json`
- Create: `sdk-connectors/motion/evaluations/route-cases.json`
- Replace: `sdk-connectors/gsap/sdk.manifest.json`
- Create: `sdk-connectors/gsap/SKILL.md`
- Create: `sdk-connectors/gsap/docs.sources.json`
- Create: `sdk-connectors/gsap/compatibility.json`
- Create: `sdk-connectors/gsap/evaluations/route-cases.json`
- Test: `packages/connectors/test/phase4-connectors.test.ts`

**Interfaces:**
- Consumes: Connector Manifest v2 schema and existing `FileSystemConnectorCatalog` health evaluator.
- Produces: three `SchemaV2ConnectorRecord` values whose `health()` state is `healthy` and `selectable` is `true`.

- [ ] **Step 1: Write failing connector-readiness tests**

```ts
import { describe, expect, it } from "vitest";
import { FileSystemConnectorCatalog } from "../src/index.js";
import { repositoryRoot } from "./fixtures.js";

for (const connectorId of ["web-platform", "motion", "gsap"] as const) {
  it(`${connectorId} is healthy, approved, selectable, and complete`, () => {
    const catalog = new FileSystemConnectorCatalog({ root: repositoryRoot() });
    const record = catalog.get(connectorId);
    expect(record?.kind).toBe("schema-v2");
    expect(catalog.health(connectorId)).toMatchObject({
      connectorId,
      state: "healthy",
      selectable: true,
      blockers: [],
      errors: []
    });
  });
}
```

Add assertions that every `relatedFiles` entry is `present`, every file exists, every JSON file parses, and runtime versions/licenses equal the reviewed baseline.

- [ ] **Step 2: Run test and confirm RED**

Run:

```bash
pnpm --filter @soren-sdk/connectors test -- phase4-connectors
```

Expected: Web Platform is blocked and Motion/GSAP are legacy records.

- [ ] **Step 3: Write focused Web Platform files**

`SKILL.md` must use valid Agent Skills frontmatter and describe when CSS transition, CSS animation, or WAAPI is sufficient. It must explicitly reject complex choreography and state that it grants no tools.

`docs.sources.json` must record MDN/W3C sources with authority, retrieval date `2026-07-30`, and link/summarize usage only.

`compatibility.json` must state:

```json
{
  "schemaVersion": "1.0.0",
  "providerId": "web-platform",
  "relationships": [
    {
      "providerId": "motion",
      "status": "compatible-with-ownership",
      "condition": "Different explicit scope or property ownership"
    },
    {
      "providerId": "gsap",
      "status": "compatible-with-ownership",
      "condition": "Different explicit scope or property ownership"
    }
  ]
}
```

- [ ] **Step 4: Complete Web Platform manifest**

Set:

```json
{
  "connectorVersion": "0.3.0",
  "connector": {
    "reviewStatus": "approved",
    "selectable": true,
    "blockers": []
  },
  "sourceTrust": {
    "sourceAuthority": "official",
    "integrityLevel": "url-recorded",
    "reviewedAt": "2026-07-30",
    "reviewer": "soren-sdk"
  },
  "relatedFiles": {
    "skill": { "path": "./SKILL.md", "status": "present" },
    "sources": { "path": "./docs.sources.json", "status": "present" },
    "compatibility": { "path": "./compatibility.json", "status": "present" },
    "evaluations": { "path": "./evaluations/", "status": "present" }
  },
  "knowledge": {
    "retrievedAt": "2026-07-30",
    "staleAfterDays": 30
  }
}
```

- [ ] **Step 5: Create Motion Manifest v2 and supporting files**

Required capability claims:

```text
motion.presence
motion.layout
motion.shared-layout
motion.spring
interaction.drag
interaction.gesture
```

Required integrations:

```text
motion-runtime          runtime-package  motion@12.42.2  MIT
motion-docs             documentation    12.42.2
motion-agent-skill      agent-skill      reviewed source record
motion-ai-kit           mcp-server       paid/authenticated optional artifact
```

The runtime integration is available, unauthenticated, no network, `project-read`, no project write, package `motion`, imports `motion/react` and `motion`.

The AI Kit integration is recorded but is not a required companion for runtime claims. It has `paidPlan: true`, requires authorization, and therefore cannot be silently selected by the Phase 4 policy.

Ownership claims:

```text
presence / selected-elements / exclusive / presence
layout / selected-elements / exclusive / layout, transform
interaction / selected-elements / exclusive / transform, pointer
```

- [ ] **Step 6: Create GSAP Manifest v2 and supporting files**

Required capability claims:

```text
motion.timeline
motion.svg
motion.flip
scroll.triggered-animation
scroll.pinned-sequence
```

Required integrations:

```text
gsap-runtime       runtime-package  gsap@3.15.0  LicenseRef-GSAP-Standard
gsap-docs          documentation    3.15.0
gsap-agent-skill   agent-skill      MIT
```

Runtime imports include `gsap` and `gsap/ScrollTrigger`. Ownership claims cover timeline, SVG animation, layout/transform for FLIP, and scroll-trigger ownership.

- [ ] **Step 7: Add connector-local route cases**

Each `evaluations/route-cases.json` must contain at least:

- One positive capability case per claim family
- One avoid/native-preferred case
- One forbidden/unhealthy case
- One ownership composition case
- One order-independence case

The files are data-only; they are not executable instructions.

- [ ] **Step 8: Run GREEN checks**

```bash
pnpm validate:repository
pnpm --filter @soren-sdk/connectors test -- phase4-connectors
pnpm --filter @soren-sdk/connectors typecheck
```

Expected: all pass; `catalog get motion`, `catalog get gsap`, and health commands return Schema v2 healthy records.

- [ ] **Step 9: Commit**

```bash
git add sdk-connectors packages/connectors/test/phase4-connectors.test.ts
git commit -m "feat(connectors): approve Phase 4 routing providers"
```

---

### Task 2: Add immutable Phase 4 policy and route-domain types

**Files:**
- Create: `packages/core/src/router/types.ts`
- Create: `packages/core/src/router/policy.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/router/policy.test.ts`

**Interfaces:**
- Consumes: `PolicyDocument`, `RouteRequest`, `ProjectSnapshot`, `RoutePlan`, `CatalogReader`.
- Produces:

```ts
export interface RouteInput {
  request: RouteRequest;
  project: ProjectSnapshot;
  catalog: CatalogReader;
  policy?: PolicyDocument;
  createdAt?: string;
}

export interface ActiveRoutingPolicy {
  document: PolicyDocument;
  snapshotId: Digest;
}

export function getPhase4Policy(override?: PolicyDocument): ActiveRoutingPolicy;
```

- [ ] **Step 1: Write failing policy tests**

Tests must prove:

```ts
it("creates the immutable read-only Phase 4 policy");
it("produces a stable policy digest");
it("allows only web-platform, motion, and gsap");
it("rejects an override that weakens network, write, paid, experimental, or connector denies");
it("allows an override that tightens allowed connectors or licenses");
```

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @soren-sdk/core test -- policy
```

Expected: missing router policy module.

- [ ] **Step 3: Implement built-in policy**

Use exactly:

```ts
const PHASE4_POLICY: PolicyDocument = {
  schemaVersion: "1.0.0-draft.1",
  contractKind: "policy",
  policyId: "phase-4-read-only",
  version: "1.0.0",
  scope: "builtin",
  rules: {
    allowedConnectors: ["gsap", "motion", "web-platform"],
    deniedConnectors: [],
    allowExperimental: false,
    allowedLicenses: ["LicenseRef-GSAP-Standard", "MIT", "not-applicable"],
    allowPaidServices: false,
    network: { mode: "deny", allowedHosts: [] },
    filesystem: { read: ["project"], write: [] },
    allowRemoteProjectContent: false,
    requireReducedMotion: true,
    requiredApprovals: []
  }
};
```

Validate the document through `validateContract<PolicyDocument>("policy", value)` before returning it.

- [ ] **Step 4: Implement tightening-only override merge**

A supplied policy may:

- Remove allowed connectors
- Add denied connectors
- Keep `allowExperimental` false
- Remove allowed licenses
- Keep `allowPaidServices` false
- Keep network deny
- Narrow filesystem read
- Keep filesystem write empty
- Keep remote project content false
- Keep reduced-motion required

Any weakening throws `RouteInputError` with code `POLICY_WEAKENING_DENIED`.

- [ ] **Step 5: Run GREEN checks and commit**

```bash
pnpm --filter @soren-sdk/core test -- policy
pnpm --filter @soren-sdk/core typecheck
pnpm --filter @soren-sdk/core build

git add packages/core/src/router packages/core/src/index.ts packages/core/test/router/policy.test.ts
git commit -m "feat(router): add immutable Phase 4 policy"
```

---

### Task 3: Build provider candidates and conservative environment checks

**Files:**
- Create: `packages/core/src/router/semver.ts`
- Create: `packages/core/src/router/candidates.ts`
- Test: `packages/core/test/router/fixtures.ts`
- Test: `packages/core/test/router/candidates.test.ts`

**Interfaces:**
- Consumes: healthy `SchemaV2ConnectorRecord`, `ProjectSnapshot`, `RouteRequest`, active policy.
- Produces:

```ts
export interface ProviderCandidate {
  providerId: "gsap" | "motion" | "web-platform";
  native: boolean;
  manifest: ConnectorManifest;
  runtimeIntegrationIds: string[];
  installed: boolean;
  legacyAliasPresent: boolean;
  claims: CandidateClaim[];
}

export interface CandidateClaim {
  capabilityId: string;
  support: "primary" | "secondary" | "fallback";
  confidence: number;
  environmentSupported: boolean;
  environmentReason?: string;
}

export function buildProviderCandidates(input: CandidateInput): CandidateBuildResult;
```

- [ ] **Step 1: Write failing candidate tests**

Cover:

- Legacy/unhealthy/non-selectable connectors excluded
- Policy-denied connector excluded
- Runtime artifact must be available and license allowed
- Paid optional artifacts do not block a free runtime route
- `motion` dependency marks Motion installed
- `gsap` dependency marks GSAP installed
- `framer-motion` marks `legacyAliasPresent` but does not mark Motion runtime installed
- Motion React claims pass for React `18.2.0`, `^19.0.0`, `>=18.2`
- Motion React claims fail for `18.1.0`, `^17`, or unparseable workspace ranges
- GSAP claims remain framework agnostic

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @soren-sdk/core test -- candidates
```

- [ ] **Step 3: Implement conservative version parsing**

Provide:

```ts
export function minimumDeclaredVersion(range: string): [number, number, number] | null;
export function isAtLeast(range: string, minimum: [number, number, number]): boolean | null;
```

Support exact, major, major/minor, caret, tilde, `>=`, `workspace:`, and `npm:` prefixes. Return `null` when safety cannot be proven.

- [ ] **Step 4: Implement candidate construction**

Rules:

1. Sort provider IDs before processing.
2. Require Schema v2, healthy, selectable, approved/stable.
3. Apply allowed/denied/experimental policy.
4. Find available runtime or built-in integration artifacts.
5. Evaluate only required runtime artifact license/paid/permission constraints.
6. Map claims from the manifest.
7. Apply Motion React environment rule.
8. Attach installed dependency and legacy alias evidence.

- [ ] **Step 5: Run GREEN checks and commit**

```bash
pnpm --filter @soren-sdk/core test -- candidates
pnpm --filter @soren-sdk/core typecheck

git add packages/core/src/router packages/core/test/router
git commit -m "feat(router): build constrained provider candidates"
```

---

### Task 4: Implement ownership resolution and provider-set ranking

**Files:**
- Create: `packages/core/src/router/ownership.ts`
- Create: `packages/core/src/router/rank.ts`
- Test: `packages/core/test/router/ownership.test.ts`
- Test: `packages/core/test/router/rank.test.ts`

**Interfaces:**
- Produces:

```ts
export interface CapabilityAssignment {
  capabilityId: string;
  providerId: string;
  native: boolean;
  integrationIds: string[];
  support: "primary" | "secondary" | "fallback";
  confidence: number;
  installed: boolean;
  preferredRank: number | null;
}

export interface OwnershipResolution {
  ownership: RoutePlan["ownership"];
  status: "ok" | "needs-input" | "blocked";
  constraints: RoutePlan["constraints"];
  requiredInput: string[];
}

export function resolveOwnership(...): OwnershipResolution;
export function compareRouteCandidates(left: RankedRoute, right: RankedRoute): number;
```

- [ ] **Step 1: Write failing ownership tests**

Cases:

- Missing scope/property receives capability-specific defaults
- Motion layout and GSAP timeline on different scopes pass
- Same explicit scope/property with Motion and GSAP blocks
- Same scope with explicit non-overlapping properties passes
- Same scope with missing property and overlapping transform/layout templates returns `needs-input`
- Ownership output is sorted by provider, scope, domain, properties

- [ ] **Step 2: Write failing rank tests**

Cases:

- Fewer third-party providers wins
- More native coverage wins
- Existing installed provider wins when coverage is otherwise equal
- Preferred-provider order is honored after dependency reuse
- Primary beats secondary/fallback
- Higher confidence wins
- Provider enumeration order has no effect
- Material architectural tie is marked rather than arbitrarily resolved

- [ ] **Step 3: Implement ownership defaults**

Use the exact defaults in the approved design. Read optional string `scope` and `property` from each capability's `quality` object.

- [ ] **Step 4: Implement deterministic rank vector**

```ts
[
  selectedProviderCount,
  -nativeCoverageCount,
  -installedSelectedProviderCount,
  preferredRankVector,
  -primaryCount,
  secondaryCount,
  fallbackCount,
  -confidenceTotal
]
```

Stable provider ID ordering is used only after verifying behavioral equivalence.

- [ ] **Step 5: Run GREEN checks and commit**

```bash
pnpm --filter @soren-sdk/core test -- ownership rank
pnpm --filter @soren-sdk/core typecheck

git add packages/core/src/router packages/core/test/router
git commit -m "feat(router): resolve ownership and rank provider sets"
```

---

### Task 5: Implement deterministic `routeCapabilities`

**Files:**
- Create: `packages/core/src/router/explain.ts`
- Create: `packages/core/src/router/route-capabilities.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/router/route-capabilities.test.ts`
- Test: `packages/core/test/router/metamorphic.test.ts`

**Interfaces:**
- Produces public API:

```ts
export function routeCapabilities(input: RouteInput): RoutePlan;
```

- [ ] **Step 1: Write failing route tests**

Minimum direct cases:

```text
CSS transition -> native
CSS animation -> native
WAAPI -> native
Motion presence -> selected motion
Motion layout -> selected motion
GSAP timeline -> selected gsap
Motion + GSAP separate scopes -> selected both
Same scope/property conflict -> blocked
Unknown required capability -> blocked
Only unknown optional capability -> no-sdk
Provider limit exceeded -> blocked
Motion with React 17 -> blocked
Forbidden Motion -> blocked
```

- [ ] **Step 2: Write failing metamorphic tests**

Prove no decision/digest change for:

- Requested capability order
- Catalog enumeration order
- `createdAt`
- Project root path when project snapshot ID is unchanged
- Unrelated dependency addition that does not alter project snapshot fixture used by router

Prove a reason change to `EXISTING_DEPENDENCY_REUSE` when the appropriate package is installed without changing capability coverage.

- [ ] **Step 3: Validate inputs**

Validate request/project/policy contracts, enforce project snapshot ID equality, normalize capabilities by ID and canonical quality JSON, reject contradictory required/optional duplicates, and build a catalog snapshot.

- [ ] **Step 4: Enumerate provider subsets**

For eligible third-party providers sorted by ID, enumerate the power set up to `maxProviders`. Native claims are always available independently. Assign the best claim for each capability within a subset.

- [ ] **Step 5: Produce each outcome**

- `native`: all required covered natively; no selected providers
- `selected`: one or more third-party providers selected
- `no-sdk`: no required capability needs coverage and unsupported optional capabilities omitted
- `needs-input`: material tie or ownership ambiguity
- `blocked`: required capability, policy, environment, provider-limit, runtime-artifact, or ownership failure

- [ ] **Step 6: Build explanations**

Use stable reason codes from the design. Sort selected providers, rejected providers, ownership, constraints, and required input.

- [ ] **Step 7: Generate deterministic plan digest**

Build a decision payload excluding `createdAt`, `planId`, `digest`, and `requestId`; include normalized capability quality data. Compute:

```ts
const digest = digestJson(payload);
const planId = `route_${digest.slice("sha256:".length, "sha256:".length + 24)}`;
```

Validate the final value with `validateContract<RoutePlan>("route-plan", plan)`.

- [ ] **Step 8: Run GREEN checks and commit**

```bash
pnpm --filter @soren-sdk/core test -- route-capabilities metamorphic
pnpm --filter @soren-sdk/core typecheck
pnpm --filter @soren-sdk/core build

git add packages/core/src/router packages/core/src/index.ts packages/core/test/router
git commit -m "feat(router): add deterministic native-first routing"
```

---

### Task 6: Add 30+ data-driven routing evaluations

**Files:**
- Create: `evaluations/phase-4-routing.json`
- Create: `packages/core/test/router/evaluations.test.ts`

**Interfaces:**

```ts
interface RouteEvaluationCase {
  id: string;
  capabilities: Array<{
    id: string;
    required: boolean;
    quality?: Record<string, string | number | boolean>;
  }>;
  preferences?: Partial<RouteRequest["preferences"]>;
  project: {
    react?: string;
    dependencies?: string[];
  };
  expected: {
    status: RoutePlan["status"];
    selectedProviders: string[];
    reasonCodes?: string[];
  };
}
```

- [ ] **Step 1: Create at least 36 cases**

Required distribution:

- 6 native
- 8 Motion
- 7 GSAP
- 7 composition/ownership/provider-limit
- 8 negative/metamorphic

Every capability in the Phase 4 surface must appear in at least one positive case and one relevant negative/composition case.

- [ ] **Step 2: Write failing harness**

Load JSON as data, build fixture requests/projects/catalogs, call `routeCapabilities`, and assert status, providers, and expected reason codes.

- [ ] **Step 3: Run and fix only genuine router defects**

```bash
pnpm --filter @soren-sdk/core test -- evaluations
```

Do not weaken expected safety outcomes merely to make cases pass.

- [ ] **Step 4: Commit**

```bash
git add evaluations packages/core/test/router/evaluations.test.ts
git commit -m "test(router): add Phase 4 golden evaluations"
```

---

### Task 7: Add explicit-capability route CLI

**Files:**
- Create: `packages/cli/src/route-options.ts`
- Modify: `packages/cli/src/run.ts`
- Modify: `packages/cli/src/format.ts`
- Create: `packages/cli/test/route-cli.test.ts`
- Modify: `packages/cli/README.md`
- Modify: `package.json`

**Interfaces:**

```ts
export interface ParsedRouteOptions {
  project: string;
  capabilities: RouteRequest["capabilities"];
  preferredProviders: string[];
  forbiddenProviders: string[];
  maxProviders: number;
  json: boolean;
}

export function parseRouteOptions(args: string[]): ParsedRouteOptions;
```

- [ ] **Step 1: Write failing parser and CLI tests**

Cover:

- Repeated `--capability` and `--optional`
- Repeated `--preferred` and `--forbidden`
- Default `--project .`
- Default `maxProviders: 2`
- Positive integer validation
- Scope/property applied to all supplied capabilities
- Missing capabilities -> exit 2
- Unknown flags -> exit 2
- Native JSON route
- Motion JSON route against a React fixture
- GSAP human route
- Ownership conflict route
- No files written by route command

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @soren-sdk/cli test -- route-cli
```

- [ ] **Step 3: Implement parser**

Use `node:util.parseArgs` only. Construct a `RouteRequest` with a stable request ID derived from the canonical normalized CLI input and project snapshot ID. The summary is a deterministic comma-separated capability description, not raw prose.

- [ ] **Step 4: Implement route command**

Execution order:

1. Inspect explicit project path.
2. Load catalog from CLI `cwd` (the Soren SDK repository/catalog root).
3. Construct `RouteRequest`.
4. Call `routeCapabilities`.
5. Emit canonical JSON or concise human summary.

Exit codes:

- `0`: valid route plan including `blocked` or `needs-input`
- `1`: catalog, inspection, validation, or internal routing failure
- `2`: invalid CLI arguments

- [ ] **Step 5: Expand smoke script**

Add a native route smoke command that requires no fixture installation:

```bash
node packages/cli/dist/bin.js route \
  --project . \
  --capability platform.css-transition \
  --json
```

- [ ] **Step 6: Run GREEN checks and commit**

```bash
pnpm --filter @soren-sdk/cli test -- route-cli
pnpm typecheck
pnpm build
pnpm smoke:cli

git add packages/cli package.json
git commit -m "feat(cli): add explicit capability route command"
```

---

### Task 8: Final CI, documentation, security review, and merge preparation

**Files:**
- Modify: `.github/workflows/contracts-ci.yml`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `packages/core/README.md`
- Modify: `packages/connectors/README.md`
- Modify: `packages/cli/README.md`
- Modify: Issue #1 and Issue #9 after merge

- [ ] **Step 1: Expand permanent CI**

Ensure permanent CI runs:

```text
install
lint
typecheck
test
build
repository validation
catalog smoke
inspector smoke
native route smoke
```

Keep `contents: read`, pinned Actions, frozen lockfile, no secrets, no publishing.

- [ ] **Step 2: Document executable routing boundary**

Document:

- Explicit capability flags only
- Web Platform/Motion/GSAP provider limit
- Built-in read-only policy
- Route outcomes and reason codes
- No installation, execution, tool calls, network, or writes
- Motion React `18.2+` limitation
- GSAP license representation
- Connector health prerequisite

- [ ] **Step 3: Run full verification**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:repository
pnpm smoke:cli
```

- [ ] **Step 4: Audit forbidden APIs and scope**

Confirm the complete PR introduces no router-side use of:

```text
child_process
exec
spawn
fetch
http
https
net
package installation
filesystem writes
MCP invocation
Agent Skill execution
```

The only existing write command remains explicit catalog SQLite snapshot persistence.

- [ ] **Step 5: Independent review**

Review exact final head for:

- Connector approval accuracy
- Native-first behavior
- Policy bypass
- Runtime artifact filtering
- React version false positives
- Provider-set minimization
- Material tie handling
- Ownership conflicts
- Digest determinism
- Evaluation completeness
- CLI safety
- Hidden side effects

- [ ] **Step 6: Update PR evidence and merge**

Record exact verified head and workflow run. Mark PR ready only when every gate passes. Squash-merge with expected-head protection; confirm Issue #9 closes and update Issue #1.

---

## Plan Self-Review

### Spec coverage

- Connector migration and official source baseline: Task 1
- Built-in policy and tightening-only overrides: Task 2
- Healthy candidate construction, artifact, license, paid, environment, and dependency checks: Task 3
- Ownership and deterministic ranking: Task 4
- All route statuses, reason codes, deterministic plan, contract validation: Task 5
- 30+ positive, negative, composition, and metamorphic cases: Task 6
- Explicit-capability CLI and no-write behavior: Task 7
- CI, documentation, audit, review, and merge gates: Task 8

### Placeholder scan

The plan contains no TBD/TODO placeholders. Every task names concrete files, interfaces, commands, expected failures, and acceptance behavior.

### Type consistency

The public API remains `routeCapabilities(input: RouteInput): RoutePlan`. Connector records use existing `CatalogReader`; policy uses existing `PolicyDocument`; outputs use existing `RoutePlan`. Internal types are defined before later tasks consume them.

### Scope check

The plan is one vertical slice: approved provider data plus deterministic routing and its CLI adapter. Natural-language extraction, broader policy hierarchy, lockfile generation, external tool invocation, installation, code generation, and mutation remain excluded.
