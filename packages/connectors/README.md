# @soren-sdk/connectors

Read-only connector discovery, health diagnostics, deterministic catalog snapshots, and local snapshot persistence for Soren SDK.

## Responsibilities

This package owns:

- Loading and validating `capabilities/catalog.json`
- Deterministic discovery of `sdk-connectors/*`
- Lazy connector-manifest loading
- Explicit representation of legacy planning manifests
- Connector health diagnostics
- Deterministic `CatalogSnapshot` generation
- In-memory snapshot persistence
- Local SQLite snapshot persistence

It does **not** own routing, provider scoring, package installation, MCP invocation, Agent Skill execution, network access, or project mutation.

## Connector loading

`FileSystemConnectorCatalog`:

- Skips underscore-prefixed template directories
- Sorts connector directories deterministically
- Validates Schema v2 manifests through `@soren-sdk/contracts`
- Keeps legacy manifests visible but permanently non-selectable
- Rejects missing, malformed, invalid, unreadable, and duplicate manifests
- Never imports or executes connector content

```ts
import { FileSystemConnectorCatalog } from "@soren-sdk/connectors";

const catalog = new FileSystemConnectorCatalog({ root: process.cwd() });
const records = catalog.list();
const motion = catalog.get("motion");
const health = catalog.health("motion");
```

## Phase 4 routing providers

The following records are complete Connector Manifest v2 providers:

| Provider | Runtime | License | Review | Selectable |
|---|---|---|---|---|
| Web Platform | Built-in | `not-applicable` | Approved | Yes |
| Motion | `motion@12.42.2` | MIT | Approved | Yes |
| GSAP | `gsap@3.15.0` | `LicenseRef-GSAP-Standard` | Approved | Yes |

Each provider contains:

- `sdk.manifest.json`
- Focused `SKILL.md`
- Official source registry
- Compatibility data
- Connector-local route cases

Provider readiness does not bypass routing constraints. Core routing independently checks health, policy, environment, runtime artifacts, licenses, provider limits, capabilities, and ownership.

Lenis, React Three Fiber, Storybook, and shadcn remain visible legacy planning manifests and cannot be selected.

## Health diagnostics

Health is diagnostic information; it is not routing approval.

The evaluator reports:

- Connector blockers
- Review and selectable state
- Stale knowledge
- Unresolved available artifact versions
- Unresolved executable-artifact licenses
- Missing related files declared as present
- Related paths that escape the connector directory

Health states are:

```text
healthy
blocked
legacy
invalid
missing
```

## Deterministic snapshots

`buildCatalogSnapshot` creates a contract-valid snapshot with:

- A canonical capability-catalog digest
- Schema v2 connector digests
- Stable connector ordering
- A snapshot ID independent of directory order and `createdAt`

Legacy connectors remain visible in queries but are excluded from Schema v2 snapshot entries.

## Storage adapters

Both adapters implement `CatalogSnapshotStore`:

```ts
interface CatalogSnapshotStore {
  save(snapshot: CatalogSnapshot): void;
  get(snapshotId: string): CatalogSnapshot | undefined;
  list(limit?: number): CatalogSnapshot[];
  close(): void;
}
```

### Memory

`MemoryCatalogSnapshotStore` is intended for tests and temporary processes.

### SQLite

`SqliteCatalogSnapshotStore` uses Node.js `node:sqlite` behind the replaceable storage interface. It:

- Uses prepared statements
- Stores canonical JSON
- Stores a SHA-256 content digest
- Validates contract shape on read
- Verifies stored payload integrity
- Requires explicit closure
- Makes no network calls
- Loads no SQLite extensions

Consumers should depend on `CatalogSnapshotStore` rather than the concrete SQLite adapter where possible.
