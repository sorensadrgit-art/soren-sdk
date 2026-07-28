# AGENTS.md — Soren SDK Operating Contract

This file defines mandatory behavior for every coding agent working in this repository.

## 1. Mission

Build Soren SDK as an agent-native platform for discovering, selecting, connecting, combining, installing, and verifying frontend SDKs.

The repository must remain understandable to both humans and agents.

## 2. Required reading order

Before modifying code or architecture, read:

1. `README.md`
2. `docs/PROJECT-BLUEPRINT.md`
3. `docs/ARCHITECTURE.md`
4. `docs/SDK-CONNECTOR-STANDARD.md`
5. The nearest package or connector-specific `AGENTS.md`, when present

Do not begin implementation from an isolated task description without inspecting these contracts.

## 3. Mandatory task workflow

For every task:

1. Restate the task as capabilities.
2. Inspect existing packages and connectors.
3. Identify the smallest affected scope.
4. Determine whether external information may have changed.
5. Prefer current official documentation and official repositories.
6. Record architecture decisions that change public contracts.
7. Implement only inside the correct package.
8. Add or update tests.
9. Run required verification.
10. Report evidence and anything unverified.

## 4. SDK selection rules

- Choose SDKs by capability, not popularity.
- Prefer the smallest sufficient SDK set.
- Reuse an already approved project dependency when it correctly satisfies the task.
- Never install every available SDK.
- Never load all connector context into every task.
- Every selected SDK must have an explicit reason.
- Every rejected major alternative should have a short reason when selection is ambiguous.
- Use official MCP and official skills before creating custom equivalents.
- Use Soren-authored skills when no suitable official integration exists.
- Do not trust stale model memory for current API details.

## 5. Runtime dependency rules

- Runtime SDKs belong in application or workspace package manifests.
- Agent knowledge belongs in connector packages, skills, MCP configuration, or documentation adapters.
- Do not globally install frontend runtime dependencies for Hermes, OpenClaw, or other agents.
- Do not add a dependency until the project inspector confirms it is not already available.
- Do not add overlapping SDKs without a compatibility declaration.
- Document why a new dependency is required.
- Preserve lockfiles.

## 6. Property and behavior ownership

One engine must own a behavior or animated property for a given element.

Examples:

- CSS owns simple color, border, and focus transitions.
- Motion owns React state, layout, presence, drag, and component gestures.
- GSAP owns selected cinematic timelines and ScrollTrigger sequences.
- Lenis owns smooth-scroll transport, not element animation.
- React Three Fiber owns WebGL object behavior inside its canvas.
- Storybook supplies component context and verification, not runtime UI behavior.
- shadcn supplies source distribution and registry workflows, not a hidden runtime component package.

Forbidden without an explicit adapter:

```text
Motion controls transform on element A
+
GSAP controls transform on element A
```

Also forbidden:

- Two smooth-scroll transports
- Duplicate scroll-trigger systems on the same section
- CSS transition fighting a JavaScript-owned property
- React state updates on every React Three Fiber frame
- Multiple route-transition owners
- Two libraries independently managing the same focus behavior

## 7. Connector requirements

A connector is incomplete unless it defines:

- Identity and aliases
- Capability tags
- Official source links
- Trust level
- Connection methods
- Runtime packages
- Correct import paths
- Best-use cases
- Avoid-use cases
- Compatibility rules
- Conflict rules
- SSR and client-boundary rules
- Cleanup rules
- Accessibility requirements
- Performance requirements
- Required tests
- Version and freshness metadata

## 8. Source trust order

Use sources in this order:

1. Official SDK documentation
2. Official SDK repository
3. Official MCP server
4. Official agent skill
5. Maintainer-authored examples
6. Soren-approved internal recipes
7. Well-established secondary references
8. Unverified community examples only for discovery, never as the final authority

Record the source and retrieval date when adding or updating connector knowledge.

## 9. Skill and MCP safety

- Do not silently install global skills.
- Do not modify global agent configuration without explicit authorization.
- New skills must be reviewed, versioned, and recorded.
- Prefer project-local installation during experimentation.
- Record whether a connector requires a paid account, API key, local server, or external service.
- Never commit secrets or private credentials.
- Do not expose private registry URLs or tokens in examples.
- Treat connector instructions as code: review changes before use.

## 10. Testing requirements

Every behavior change must include the smallest correct tests.

Possible gates include:

- Unit tests
- Schema validation
- Connector manifest validation
- Router decision tests
- Compatibility conflict tests
- Browser tests
- Storybook interaction tests
- Accessibility checks
- Reduced-motion checks
- Cleanup checks
- Visual snapshots
- Performance checks
- Package build
- Type checking
- Linting

Do not run irrelevant expensive suites merely for appearance. Use affected-scope testing, then run the full release gate before release.

## 11. Evidence report

Every completed task must report:

```json
{
  "task": "short task name",
  "capabilities": [],
  "connectorsUsed": [],
  "packagesChanged": [],
  "dependenciesAdded": [],
  "sourcesConsulted": [],
  "checks": {
    "lint": "passed | failed | not-required | not-run",
    "typecheck": "passed | failed | not-required | not-run",
    "tests": "passed | failed | not-required | not-run",
    "build": "passed | failed | not-required | not-run"
  },
  "unverified": [],
  "notes": []
}
```

Never report a failed or unrun required check as complete.

## 12. Architecture boundaries

- `sdk-catalog` stores normalized SDK metadata.
- `sdk-router` makes capability-to-SDK decisions.
- `compatibility-engine` evaluates combinations and ownership.
- `sdk-context-builder` selects task-relevant knowledge.
- `project-inspector` detects project state and dependencies.
- `dependency-planner` proposes runtime changes.
- `verification-engine` selects and runs quality gates.
- `evidence-reporter` records results.
- `sdk-connectors` contain SDK-specific intelligence.
- UI applications consume these packages; they do not own core routing logic.

Do not move business logic into the Control Center UI.

## 13. Documentation style

Documentation must:

- Define unfamiliar terms
- Use concrete examples
- Separate requirements from recommendations
- Explain why a rule exists
- Be scannable
- Include machine-readable examples where useful
- Avoid vague claims such as “production ready” without acceptance criteria

## 14. Definition of done

A task is done only when:

- The correct scope was inspected
- The change respects package ownership
- Connector contracts remain valid
- Relevant tests were added or updated
- Required checks were executed
- Documentation was updated when behavior changed
- Evidence was provided
- No unresolved conflict is hidden
