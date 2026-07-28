# Soren SDK Architecture

## 1. Architectural style

Soren SDK should be a TypeScript monorepo with a framework-independent core and optional user interfaces.

Recommended baseline:

- Node.js
- pnpm workspaces
- TypeScript
- Turborepo
- Zod or JSON Schema for contracts
- Vitest for core tests
- Playwright for browser verification
- Next.js or Vite for visual applications

The core routing packages must not depend on a specific UI framework.

---

## 2. Layer model

### Layer 1 — Domain contracts

Contains stable shared types:

- SDK identifier
- Capability identifier
- Connector manifest
- Project inspection result
- Compatibility relationship
- Route request
- Route decision
- Verification requirement
- Evidence report

Suggested package:

```text
packages/contracts
```

### Layer 2 — Intelligence data

Contains:

- SDK catalog
- Connector manifests
- Compatibility rules
- Capability mappings
- Approved recipes
- Source records

Suggested locations:

```text
packages/sdk-catalog
sdk-connectors/
```

### Layer 3 — Decision engines

Contains:

- Request decomposition
- Candidate retrieval
- SDK scoring
- Set minimization
- Compatibility resolution
- Ownership assignment

Suggested packages:

```text
packages/sdk-router
packages/compatibility-engine
```

### Layer 4 — Project operations

Contains:

- Project inspection
- Dependency planning
- Connector context selection
- Verification selection
- Evidence generation

Suggested packages:

```text
packages/project-inspector
packages/dependency-planner
packages/sdk-context-builder
packages/verification-engine
packages/evidence-reporter
```

### Layer 5 — Agent adapters

Translates normalized Soren SDK operations into agent-specific formats.

```text
packages/agent-adapters/hermes
packages/agent-adapters/openclaw
packages/agent-adapters/opencode
packages/agent-adapters/codex
packages/agent-adapters/claude-code
```

Agent adapters must not contain duplicated SDK knowledge.

### Layer 6 — Applications

```text
apps/control-center
apps/evaluation-lab
apps/docs
apps/playground
```

Applications consume core packages. They do not redefine routing or compatibility rules.

---

## 3. Proposed repository structure

```text
soren-sdk/
├── apps/
│   ├── control-center/
│   ├── docs/
│   ├── evaluation-lab/
│   └── playground/
│
├── packages/
│   ├── contracts/
│   ├── sdk-catalog/
│   ├── sdk-router/
│   ├── sdk-context-builder/
│   ├── compatibility-engine/
│   ├── project-inspector/
│   ├── dependency-planner/
│   ├── verification-engine/
│   ├── evidence-reporter/
│   ├── cli/
│   ├── testing/
│   └── agent-adapters/
│
├── sdk-connectors/
│   ├── _template/
│   ├── motion/
│   ├── gsap/
│   ├── lenis/
│   ├── react-three-fiber/
│   ├── storybook/
│   └── shadcn/
│
├── evaluations/
│   ├── routing/
│   ├── implementation/
│   └── fixtures/
│
├── docs/
├── .github/
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 4. Core package responsibilities

### `@soren-sdk/contracts`

Owns:

- Shared schemas
- Stable enums
- Validation errors
- Schema versioning

Does not own:

- SDK records
- Routing logic
- File-system inspection

### `@soren-sdk/sdk-catalog`

Owns:

- Loading connector manifests
- SDK lookup
- Capability indexes
- Trust filtering
- Version metadata
- Catalog validation

Does not own:

- Final route selection
- Package installation
- Browser tests

### `@soren-sdk/sdk-router`

Owns:

- Capability request
- Candidate ranking
- Set minimization
- Selection explanation
- Alternative analysis

Does not own:

- Project file parsing
- Dependency writes
- External MCP execution

### `@soren-sdk/compatibility-engine`

Owns:

- SDK relationship rules
- Property ownership
- Behavior ownership
- Conflict detection
- Adapter requirements
- Resolution suggestions

### `@soren-sdk/project-inspector`

Owns:

- Reading package manifests
- Detecting workspaces
- Detecting frameworks
- Detecting current dependencies
- Detecting relevant config
- Detecting server/client boundaries where possible

It must be read-only.

### `@soren-sdk/dependency-planner`

Owns:

- Proposed dependency changes
- Target workspace selection
- Install command generation
- Existing alternative detection
- Dependency reason report

Writing changes should be a separate explicit execution operation.

### `@soren-sdk/sdk-context-builder`

Owns:

- Relevant connector section selection
- Source link selection
- Recipe selection
- Context budget enforcement
- Agent-neutral context output

### `@soren-sdk/verification-engine`

Owns:

- Verification requirement aggregation
- Affected-scope test planning
- Validator execution
- Check normalization
- Failure reporting

### `@soren-sdk/evidence-reporter`

Owns:

- JSON evidence
- Markdown summary
- Stable run identifiers
- Source and version traceability

### `@soren-sdk/cli`

First user interface:

```bash
soren-sdk inspect
soren-sdk catalog list
soren-sdk connector show motion
soren-sdk route "<request>"
soren-sdk conflicts
soren-sdk plan
soren-sdk verify
soren-sdk report
```

---

## 5. Data flow

```text
Input request
    ↓
Request normalizer
    ↓
Project inspector
    ↓
Capability resolver
    ↓
Catalog candidate search
    ↓
Hard constraints
    ↓
Candidate scoring
    ↓
Set minimization
    ↓
Compatibility engine
    ↓
Ownership plan
    ↓
Context builder
    ↓
Dependency planner
    ↓
Agent execution
    ↓
Verification engine
    ↓
Evidence reporter
```

Agent execution may happen outside the core repository. Soren SDK should produce a stable plan that different agents can consume.

---

## 6. Connector loading

Connectors should be loaded lazily.

At startup, the catalog may load small manifest indexes.

Large items should be loaded only after selection:

- Skill instructions
- Recipes
- Detailed docs indexes
- Validators
- Migration records

This prevents memory and context growth as the catalog expands.

---

## 7. Version strategy

Each connector should distinguish:

- Connector schema version
- Connector content version
- SDK runtime version range
- Official skill version or commit
- MCP server version
- Documentation retrieval date

Example:

```json
{
  "schemaVersion": "1.0.0",
  "connectorVersion": "0.1.0",
  "runtime": {
    "package": "motion",
    "supported": ">=12 <13"
  },
  "knowledge": {
    "retrievedAt": "2026-07-27"
  }
}
```

Do not imply that connector version equals runtime SDK version.

---

## 8. Failure model

Use typed errors.

Examples:

- `PROJECT_NOT_DETECTED`
- `CONNECTOR_INVALID`
- `CAPABILITY_UNSUPPORTED`
- `NO_COMPATIBLE_SDK_SET`
- `OWNERSHIP_CONFLICT`
- `SOURCE_UNAVAILABLE`
- `CREDENTIAL_REQUIRED`
- `RUNTIME_VERSION_UNSUPPORTED`
- `VERIFICATION_FAILED`
- `EVIDENCE_INCOMPLETE`

Every failure should include:

- Human-readable explanation
- Machine-readable code
- Relevant connector
- Suggested next action
- Whether execution may safely continue

---

## 9. Extension model

A new connector should not require modifying router source code when its capabilities and rules fit existing schemas.

The router reads connector metadata.

Core code changes should be needed only for:

- New capability semantics
- New relationship types
- New execution methods
- New verification engine type
- New agent adapter protocol

---

## 10. Architecture constraints

- Core packages must run without a browser.
- Connector knowledge must remain separate from runtime application code.
- Agent adapters must remain thin.
- The Control Center cannot become the system of record.
- Every public schema must be versioned.
- Project inspection is read-only.
- Dependency execution is separate from dependency planning.
- External service access must be explicit.
- Connectors must be testable without loading all other connectors.
