# Phase 4 — Native-First Capability Router

Phase 4 adds the first executable routing vertical slice to Soren SDK. It resolves explicit capability requests across three providers only:

1. Web Platform
2. Motion
3. GSAP

The router is deterministic, provider-neutral at the contract boundary, read-only, and intentionally does not interpret natural-language requests.

## Public API

```ts
import type { RouteRequest } from "@soren-sdk/contracts";
import {
  inspectProject,
  routeCapabilities
} from "@soren-sdk/core";
import { FileSystemConnectorCatalog } from "@soren-sdk/connectors";

const createdAt = new Date().toISOString();
const project = inspectProject({
  root: "/path/to/project",
  createdAt
});
const catalog = new FileSystemConnectorCatalog({
  root: "/path/to/soren-sdk"
});

const request: RouteRequest = {
  schemaVersion: "1.0.0-draft.1",
  contractKind: "route-request",
  requestId: "request_example",
  createdAt,
  projectSnapshotId: project.snapshotId,
  summary: "Explicit timeline route",
  capabilities: [
    {
      id: "motion.timeline",
      required: true,
      quality: {
        scope: "hero",
        property: "transform"
      }
    }
  ],
  preferences: {
    preferredProviders: [],
    forbiddenProviders: [],
    maxProviders: 1,
    allowPaidServices: false,
    allowExperimental: false
  }
};

const plan = routeCapabilities({
  request,
  project,
  catalog,
  createdAt
});
```

`routeCapabilities()` returns a contract-valid `RoutePlan` with one of five statuses:

- `native` — Web Platform fully satisfies every required capability.
- `selected` — one or more approved third-party providers are required.
- `no-sdk` — no required capability forces provider selection.
- `needs-input` — materially different valid architectures remain tied.
- `blocked` — a hard constraint prevents a valid route.

## Supported capabilities

### Web Platform

- `platform.css-transition`
- `platform.css-animation`
- `platform.waapi-animation`

### Motion

- `motion.presence`
- `motion.layout`
- `motion.shared-layout`
- `motion.spring`
- `interaction.drag`
- `interaction.gesture`

### GSAP

- `motion.timeline`
- `motion.svg`
- `motion.flip`
- `scroll.triggered-animation`
- `scroll.pinned-sequence`

Every other connector remains non-selectable by this router even when visible in the catalog.

## Reviewed connector versions

- Motion runtime: `motion@12.42.2`
- Motion React import: `motion/react`
- Motion AI Kit knowledge/tool metadata: `6.2.0`
- GSAP runtime: `gsap@3.15.0`
- GSAP runtime license: `LicenseRef-GSAP-Standard`

Documentation, Agent Skills, and hosted MCP metadata are modeled as separate integration artifacts. Only policy-approved runtime artifacts can appear in `selectedProviders.integrationIds`.

## Resolution order

1. Validate the Route Request, Project Snapshot, Policy, Capability Catalog, Catalog Snapshot, and final Route Plan.
2. Verify the request references the supplied Project Snapshot.
3. Normalize required and optional capability IDs.
4. Reject unknown required capabilities.
5. Identify native capability coverage.
6. Apply hard provider constraints before scoring.
7. Enumerate provider sets covering every remaining required capability.
8. Minimize provider count.
9. Prefer existing approved dependencies.
10. Apply explicit preferred-provider order.
11. Rank support level and confidence.
12. Require input for materially different tied architectures.
13. Assign ownership and block exclusive same-scope/same-property conflicts.
14. Produce stable selected and rejected explanations.
15. Compute content-addressed route identity.

## Hard constraints

A provider is never scored when any of these gates fail:

- Outside the Phase 4 allowlist
- Explicitly forbidden by the request or policy
- Legacy, unhealthy, unapproved, blocked, or non-selectable connector
- Missing a required capability claim
- Missing a policy-approved available runtime integration
- Missing a required companion runtime integration
- Unresolved runtime version
- Disallowed runtime license
- Paid runtime service when paid services are disallowed
- Runtime network, filesystem, command, remote-project-content, or project-write exposure
- Missing reduced-motion verification when the policy requires it
- Motion React capability with React below 18.2 or absent
- Provider set exceeding `maxProviders`
- Exclusive ownership conflict

The Phase 4 router selects runtime integrations only. Motion AI Kit skills and hosted MCP tools are cataloged for later read-only tool-gateway phases but are never runtime routing candidates.

## Native-first behavior

When Web Platform fully covers all required capabilities, the plan status is `native` and `selectedProviders` is empty. Optional SDK capabilities never force a dependency.

```text
platform.css-transition          → native
platform.waapi-animation         → native
motion.presence                  → selected: motion
motion.timeline                  → selected: gsap
motion.layout + motion.timeline  → selected: motion + gsap
unknown optional only            → no-sdk
unknown required                 → blocked
```

## Ownership

Each capability receives an ownership assignment containing provider, domain, scope, and properties.

A request may provide explicit ownership quality:

```json
{
  "scope": "hero",
  "property": "transform"
}
```

When no explicit quality is provided, the router uses a capability-specific fallback scope and the capability catalog's ownership domain as the property key. Two exclusive providers may coexist when their scope or property differs. They are blocked when both scope and property are identical.

## Stable reason codes

Selected-provider codes:

- `NATIVE_CAPABILITY_MATCH`
- `CAPABILITY_MATCH`
- `EXISTING_DEPENDENCY_REUSE`
- `PREFERRED_PROVIDER`
- `MINIMAL_PROVIDER_SET`

Rejection, blocking, and ambiguity codes:

- `FORBIDDEN_PROVIDER`
- `POLICY_DENIED`
- `CONNECTOR_UNHEALTHY`
- `CAPABILITY_NOT_SUPPORTED`
- `ENVIRONMENT_UNSUPPORTED`
- `PROVIDER_LIMIT_EXCEEDED`
- `OWNERSHIP_CONFLICT`
- `ALTERNATIVE_NOT_NEEDED`
- `MATERIAL_TIE`

## Determinism

The route digest and plan ID exclude:

- Route creation time
- Project absolute root
- Route digest and plan ID fields
- Request capability ordering
- Catalog enumeration ordering

Identical content produces the same route identity across clones and times. Adding an unrelated dependency does not change provider choice. Adding an installed approved provider may change the explanation to `EXISTING_DEPENDENCY_REUSE` without changing coverage.

Materially different tied architectures return `needs-input`. A stable provider ID is used only after the router proves tied routes have equivalent capability assignments, claims, ownership behavior, and policy-approved runtime artifacts.

## CLI

Native route:

```bash
soren-sdk route \
  --project ../my-project \
  --capability platform.css-transition
```

GSAP route with explicit ownership:

```bash
soren-sdk route \
  --project ../my-project \
  --capability motion.timeline \
  --preferred gsap \
  --max-providers 1 \
  --scope hero \
  --property transform \
  --json
```

Composition route:

```bash
soren-sdk route \
  --project ../my-project \
  --capability motion.layout \
  --capability motion.timeline \
  --max-providers 2 \
  --json
```

The CLI accepts only explicit flags. It does not infer capabilities from prose.

## Safety boundary

Routing performs no package installation, code generation, tool invocation, MCP execution, subprocess execution, Git command, network request, or project write. It reads local connector data and an inspected project snapshot, then returns a plan.

`catalog snapshot --database <path>` remains the CLI's only explicit persistence operation. The `route` command is always read-only.

## Verification

Permanent checks include:

- 34 positive, negative, composition, and constraint golden route cases
- Metamorphic determinism tests
- Material and behaviorally equivalent tie tests
- Required companion-runtime tests
- Reduced-motion policy regressions
- Policy-denied runtime leakage regressions
- Inconsistent catalog-health and unapproved-manifest regressions
- Ownership conflict tests
- Connector health and repository validation
- Human and JSON CLI route tests
- Read-only project assertions
- Route CLI smoke commands

Run the complete gate:

```bash
pnpm check
```
