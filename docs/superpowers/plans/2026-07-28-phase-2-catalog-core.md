# Phase 2 Catalog Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only SDK catalog that discovers connector records, reports health, creates deterministic catalog snapshots, stores snapshots locally, and exposes list/get/health/snapshot CLI commands.

**Architecture:** `@soren-sdk/core` defines provider-neutral catalog interfaces and services. `@soren-sdk/connectors` implements filesystem discovery, health evaluation, snapshot construction, and storage adapters. `@soren-sdk/cli` is a thin adapter over those services. Runtime connector artifacts remain data and are never executed.

**Tech Stack:** Node.js 24, TypeScript 6, pnpm 11.17.0, Vitest 4, Phase 1 `@soren-sdk/contracts`, Node built-ins (`node:fs`, `node:path`, `node:sqlite`, `node:util`).

## Global Constraints

- Release behavior remains read-only except explicit local SQLite snapshot persistence.
- No router, provider scoring, project inspection, MCP execution, package installation, file mutation, or Control Center code.
- No agent vendor, model provider, or model ID in required core interfaces.
- Connector documents are untrusted data and must never be imported or executed.
- Connector IDs are lowercase kebab-case and all listing order is deterministic.
- All JSON validation uses `@soren-sdk/contracts`.
- All digests use Phase 1 canonical JSON and SHA-256 helpers.
- All filesystem paths are explicit and normalized.
- All public behavior begins with a failing test.
- `node:sqlite` stays behind `CatalogSnapshotStore` because the API remains replaceable.
- CI uses Node.js 24, pnpm 11.17.0, frozen lockfile, pinned actions, and `contents: read`.

---

## File Structure

```text
packages/core/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── src/
│   ├── index.ts
│   └── catalog/
│       ├── types.ts
│       └── service.ts
└── test/
    └── catalog-service.test.ts

packages/connectors/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── src/
│   ├── index.ts
│   ├── filesystem/
│   │   ├── connector-catalog.ts
│   │   └── errors.ts
│   ├── health/
│   │   └── evaluate-health.ts
│   ├── snapshot/
│   │   └── build-snapshot.ts
│   └── storage/
│       ├── types.ts
│       ├── memory-store.ts
│       └── sqlite-store.ts
└── test/
    ├── fixtures.ts
    ├── connector-catalog.test.ts
    ├── connector-health.test.ts
    ├── catalog-snapshot.test.ts
    ├── memory-store.test.ts
    └── sqlite-store.test.ts

packages/cli/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── src/
│   ├── index.ts
│   ├── run.ts
│   ├── format.ts
│   └── bin.ts
└── test/
    └── cli.test.ts
```

---

### Task 1: Establish compact packages and catalog interfaces

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsconfig.build.json`
- Create: `packages/core/src/catalog/types.ts`
- Create: `packages/core/src/catalog/service.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/test/catalog-service.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

```ts
import type {
  CapabilityCatalog,
  CatalogSnapshot,
  ConnectorManifest
} from "@soren-sdk/contracts";

export type ConnectorRecord = LegacyConnectorRecord | SchemaV2ConnectorRecord;

export interface LegacyConnectorRecord {
  kind: "legacy";
  directoryId: string;
  path: string;
  schemaVersion: string | null;
  selectable: false;
}

export interface SchemaV2ConnectorRecord {
  kind: "schema-v2";
  directoryId: string;
  path: string;
  manifest: ConnectorManifest;
  selectable: boolean;
}

export type ConnectorHealthState =
  | "blocked"
  | "healthy"
  | "invalid"
  | "legacy"
  | "missing";

export interface ConnectorHealthReport {
  connectorId: string;
  state: ConnectorHealthState;
  selectable: boolean;
  reviewStatus: string | null;
  blockers: string[];
  warnings: string[];
  errors: string[];
}

export interface CatalogReader {
  getCapabilityCatalog(): CapabilityCatalog;
  list(): ConnectorRecord[];
  get(connectorId: string): ConnectorRecord | undefined;
  health(connectorId: string): ConnectorHealthReport;
  snapshot(createdAt?: string): CatalogSnapshot;
}
```

- [ ] **Step 1: Write the failing service-delegation test**

```ts
import { describe, expect, it, vi } from "vitest";
import { CatalogService } from "../src/index.js";

it("delegates connector lookups to the catalog reader", () => {
  const get = vi.fn().mockReturnValue(undefined);
  const service = new CatalogService({
    getCapabilityCatalog: vi.fn(),
    list: vi.fn(),
    get,
    health: vi.fn(),
    snapshot: vi.fn()
  });

  expect(service.getConnector("motion")).toBeUndefined();
  expect(get).toHaveBeenCalledWith("motion");
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
pnpm --filter @soren-sdk/core test
```

Expected: failure because `@soren-sdk/core` and `CatalogService` do not exist.

- [ ] **Step 3: Implement the minimal package and service**

```ts
export class CatalogService {
  constructor(private readonly reader: CatalogReader) {}

  listConnectors(): ConnectorRecord[] {
    return this.reader.list();
  }

  getConnector(connectorId: string): ConnectorRecord | undefined {
    return this.reader.get(connectorId);
  }

  getConnectorHealth(connectorId: string): ConnectorHealthReport {
    return this.reader.health(connectorId);
  }

  createSnapshot(createdAt?: string): CatalogSnapshot {
    return this.reader.snapshot(createdAt);
  }
}
```

- [ ] **Step 4: Update root scripts to cover all packages**

Use:

```json
{
  "scripts": {
    "build": "pnpm -r --if-present build",
    "typecheck": "pnpm -r --if-present typecheck",
    "test": "pnpm -r --if-present test"
  }
}
```

Keep `lint`, `validate:repository`, and `check` behavior.

- [ ] **Step 5: Run package checks**

```bash
pnpm install --no-frozen-lockfile
pnpm --filter @soren-sdk/core test
pnpm --filter @soren-sdk/core typecheck
pnpm --filter @soren-sdk/core build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml packages/core
git commit -m "feat(core): add catalog service interfaces"
```

---

### Task 2: Implement deterministic filesystem connector discovery and lazy loading

**Files:**
- Create: `packages/connectors/package.json`
- Create: `packages/connectors/tsconfig.json`
- Create: `packages/connectors/tsconfig.build.json`
- Create: `packages/connectors/src/filesystem/errors.ts`
- Create: `packages/connectors/src/filesystem/connector-catalog.ts`
- Create: `packages/connectors/src/index.ts`
- Create: `packages/connectors/test/fixtures.ts`
- Create: `packages/connectors/test/connector-catalog.test.ts`

**Interfaces:**

```ts
export interface FileSystemConnectorCatalogOptions {
  root: string;
  expectedPublisher?: string;
}

export class FileSystemConnectorCatalog {
  constructor(options: FileSystemConnectorCatalogOptions);
  getCapabilityCatalog(): CapabilityCatalog;
  list(): ConnectorRecord[];
  get(connectorId: string): ConnectorRecord | undefined;
  health(connectorId: string): ConnectorHealthReport;
  snapshot(createdAt?: string): CatalogSnapshot;
}
```

Stable errors:

```ts
export class ConnectorCatalogError extends Error {
  constructor(
    readonly code:
      | "CAPABILITY_CATALOG_INVALID"
      | "CONNECTOR_DUPLICATE_ID"
      | "CONNECTOR_MANIFEST_INVALID"
      | "CONNECTOR_MANIFEST_MISSING"
      | "CONNECTOR_MANIFEST_UNREADABLE",
    message: string,
    readonly path?: string
  ) {
    super(message);
  }
}
```

- [ ] **Step 1: Write failing discovery tests**

Tests must prove:

```ts
it("lists connector directories in stable ID order", () => {
  // Create zeta, _template, alpha.
  // Expect ["alpha", "zeta"].
});

it("represents legacy manifests as non-selectable records", () => {
  // v1 schemaVersion -> kind legacy, selectable false.
});

it("does not read a manifest until get or list requires it", () => {
  // Spy on readFileSync or inject a reader seam.
});

it("rejects duplicate manifest connector IDs", () => {
  // directory alpha and beta both declare connector.id alpha.
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @soren-sdk/connectors test -- connector-catalog
```

- [ ] **Step 3: Implement discovery**

Rules:

1. Read `capabilities/catalog.json` once and validate it.
2. List `sdk-connectors/` directories.
3. Skip only names beginning with `_`.
4. Sort directory names using code-point order.
5. Cache loaded records by directory ID.
6. For v2 manifests, call `validateConnectorManifest` with the capability catalog.
7. For v1 manifests, create `LegacyConnectorRecord` without interpreting v1 fields as v2.
8. Missing, unreadable, or malformed manifests throw `ConnectorCatalogError`.
9. After loading all records, reject duplicate `manifest.connector.id` values.

- [ ] **Step 4: Verify GREEN**

```bash
pnpm --filter @soren-sdk/connectors test -- connector-catalog
pnpm --filter @soren-sdk/connectors typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/connectors pnpm-lock.yaml
git commit -m "feat(connectors): add deterministic filesystem catalog"
```

---

### Task 3: Implement connector health evaluation

**Files:**
- Create: `packages/connectors/src/health/evaluate-health.ts`
- Create: `packages/connectors/test/connector-health.test.ts`
- Modify: `packages/connectors/src/filesystem/connector-catalog.ts`
- Modify: `packages/connectors/src/index.ts`

**Interface:**

```ts
export interface HealthEvaluationContext {
  now: Date;
  connectorDirectory: string;
}

export function evaluateConnectorHealth(
  record: ConnectorRecord,
  context: HealthEvaluationContext
): ConnectorHealthReport;
```

- [ ] **Step 1: Write failing health tests**

```ts
it("reports legacy connectors as legacy and non-selectable", () => {});
it("reports connector blockers as blocked", () => {});
it("reports stale source knowledge as a warning", () => {});
it("reports unresolved available artifact versions", () => {});
it("reports unresolved executable artifact licenses", () => {});
it("reports a related file marked present when the file is missing", () => {});
it("reports an approved selectable connector with no issues as healthy", () => {});
```

Freshness rule:

```ts
const staleAfter = retrievedAt + staleAfterDays * 24 hours;
stale when now.getTime() > staleAfter.getTime();
```

Related file rule:

- Check only entries with `status: "present"`.
- Resolve paths relative to the connector directory.
- Reject paths escaping the connector directory.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @soren-sdk/connectors test -- connector-health
```

- [ ] **Step 3: Implement minimal health evaluator**

State precedence:

```text
legacy
→ invalid/missing if record could not be loaded
→ blocked if blockers, invalid status, unresolved required data, or missing present-file
→ healthy otherwise
```

Health output must contain sorted, stable `warnings` and `errors` arrays.

- [ ] **Step 4: Run GREEN checks**

```bash
pnpm --filter @soren-sdk/connectors test -- connector-health
pnpm --filter @soren-sdk/connectors typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/connectors
git commit -m "feat(connectors): add connector health evaluation"
```

---

### Task 4: Build deterministic CatalogSnapshot contracts

**Files:**
- Create: `packages/connectors/src/snapshot/build-snapshot.ts`
- Create: `packages/connectors/test/catalog-snapshot.test.ts`
- Modify: `packages/connectors/src/filesystem/connector-catalog.ts`
- Modify: `packages/connectors/src/index.ts`

**Interface:**

```ts
export interface BuildCatalogSnapshotInput {
  capabilityCatalog: CapabilityCatalog;
  connectors: ConnectorRecord[];
  createdAt: string;
}

export function buildCatalogSnapshot(
  input: BuildCatalogSnapshotInput
): CatalogSnapshot;
```

Digest payload:

```ts
const digestPayload = {
  capabilityCatalogDigest: digestJson(capabilityCatalog),
  connectors: schemaV2Connectors
    .map((record) => ({
      id: record.manifest.connector.id,
      connectorVersion: record.manifest.connectorVersion,
      digest: digestJson(record.manifest),
      reviewStatus: record.manifest.connector.reviewStatus,
      selectable: record.manifest.connector.selectable
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
};

const snapshotId = digestJson(digestPayload);
```

`createdAt` is included in the returned `CatalogSnapshot` but excluded from `snapshotId`.

- [ ] **Step 1: Write failing snapshot tests**

```ts
it("produces the same snapshot ID for different directory order", () => {});
it("produces the same snapshot ID for different createdAt values", () => {});
it("changes the snapshot ID when connector content changes", () => {});
it("produces a CatalogSnapshot accepted by ContractValidator", () => {});
it("excludes legacy records from the v2 connector snapshot entries", () => {});
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @soren-sdk/connectors test -- catalog-snapshot
```

- [ ] **Step 3: Implement snapshot builder**

Use only `digestJson` from `@soren-sdk/contracts`.

- [ ] **Step 4: Run GREEN**

```bash
pnpm --filter @soren-sdk/connectors test -- catalog-snapshot
```

- [ ] **Step 5: Commit**

```bash
git add packages/connectors
git commit -m "feat(connectors): add deterministic catalog snapshots"
```

---

### Task 5: Add snapshot storage interface and in-memory adapter

**Files:**
- Create: `packages/connectors/src/storage/types.ts`
- Create: `packages/connectors/src/storage/memory-store.ts`
- Create: `packages/connectors/test/memory-store.test.ts`
- Modify: `packages/connectors/src/index.ts`

**Interface:**

```ts
export interface CatalogSnapshotStore {
  save(snapshot: CatalogSnapshot): void;
  get(snapshotId: string): CatalogSnapshot | undefined;
  list(limit?: number): CatalogSnapshot[];
  close(): void;
}
```

- [ ] **Step 1: Write failing memory-store tests**

```ts
it("round trips a catalog snapshot", () => {});
it("replaces a snapshot with the same ID", () => {});
it("lists newest snapshots first", () => {});
it("honors list limit", () => {});
it("rejects invalid snapshots before storage", () => {});
it("clears resources on close", () => {});
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @soren-sdk/connectors test -- memory-store
```

- [ ] **Step 3: Implement memory store**

Validate through `validateContract<CatalogSnapshot>("catalog-snapshot", value)` in `save` and when reading internal data.

- [ ] **Step 4: Run GREEN**

```bash
pnpm --filter @soren-sdk/connectors test -- memory-store
```

- [ ] **Step 5: Commit**

```bash
git add packages/connectors
git commit -m "feat(connectors): add catalog snapshot store interface"
```

---

### Task 6: Add local SQLite snapshot storage

**Files:**
- Create: `packages/connectors/src/storage/sqlite-store.ts`
- Create: `packages/connectors/test/sqlite-store.test.ts`
- Modify: `packages/connectors/src/index.ts`

**Interface:**

```ts
import { DatabaseSync } from "node:sqlite";

export class SqliteCatalogSnapshotStore implements CatalogSnapshotStore {
  constructor(path: string | URL);
  save(snapshot: CatalogSnapshot): void;
  get(snapshotId: string): CatalogSnapshot | undefined;
  list(limit?: number): CatalogSnapshot[];
  close(): void;
}
```

Schema:

```sql
CREATE TABLE IF NOT EXISTS catalog_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  content_digest TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS catalog_snapshots_created_at
ON catalog_snapshots(created_at DESC, snapshot_id ASC);
```

- [ ] **Step 1: Write failing SQLite integration tests**

```ts
it("persists and retrieves a snapshot from a temporary database", () => {});
it("reopens an existing database", () => {});
it("lists newest snapshots first with deterministic ID tiebreaker", () => {});
it("validates stored JSON on read", () => {});
it("throws after close instead of reopening implicitly", () => {});
```

Use `mkdtemp` and delete the temporary directory in `finally`.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @soren-sdk/connectors test -- sqlite-store
```

- [ ] **Step 3: Implement the adapter**

Rules:

- Use prepared statements.
- Store `canonicalJson(snapshot)`.
- Store `digestJson(snapshot)` as `content_digest`.
- On read, parse JSON, validate the contract, and verify `digestJson(parsed) === content_digest`.
- Call `database.close()` exactly once.
- No extension loading.
- No network calls.

- [ ] **Step 4: Run GREEN**

```bash
pnpm --filter @soren-sdk/connectors test -- sqlite-store
```

- [ ] **Step 5: Commit**

```bash
git add packages/connectors
git commit -m "feat(connectors): persist catalog snapshots in sqlite"
```

---

### Task 7: Implement read-only catalog CLI

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsconfig.build.json`
- Create: `packages/cli/src/format.ts`
- Create: `packages/cli/src/run.ts`
- Create: `packages/cli/src/bin.ts`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/test/cli.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

```ts
export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface RunCliOptions {
  argv: string[];
  cwd: string;
  io: CliIo;
}

export function runCli(options: RunCliOptions): number;
```

Commands:

```text
catalog list [--json]
catalog get <connector-id> [--json]
connector health <connector-id> [--json]
catalog snapshot [--database <path>] [--json]
```

- [ ] **Step 1: Write failing CLI tests**

```ts
it("lists connector IDs in human-readable form", () => {});
it("lists stable JSON with --json", () => {});
it("gets one connector", () => {});
it("returns health JSON", () => {});
it("returns exit code 2 for unknown connector", () => {});
it("returns exit code 2 for invalid arguments", () => {});
it("does not create a database for list/get/health", () => {});
it("persists a snapshot only for catalog snapshot", () => {});
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @soren-sdk/cli test
```

- [ ] **Step 3: Implement parsing and command execution**

Use `parseArgs` from `node:util`.

Output rules:

- Human list: one connector per line: `<id>\t<kind>\t<selectable>`.
- JSON output: `canonicalJson(value)` plus newline.
- Exit `0`: success.
- Exit `2`: usage or unknown connector.
- Exit `1`: invalid catalog or storage failure.
- `bin.ts` sets `process.exitCode = runCli(...)` and performs no other process control.

- [ ] **Step 4: Add root binary script**

```json
{
  "scripts": {
    "soren-sdk": "pnpm --filter @soren-sdk/cli start"
  }
}
```

- [ ] **Step 5: Run GREEN and smoke tests**

```bash
pnpm --filter @soren-sdk/cli test
pnpm build
node packages/cli/dist/bin.js catalog list
node packages/cli/dist/bin.js catalog get web-platform --json
node packages/cli/dist/bin.js connector health web-platform --json
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml packages/cli
git commit -m "feat(cli): add read-only catalog commands"
```

---

### Task 8: Expand permanent CI and documentation

**Files:**
- Modify: `.github/workflows/contracts-ci.yml`
- Create: `packages/connectors/README.md`
- Create: `packages/cli/README.md`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Write a failing CLI smoke step locally**

Before changing CI, verify the expected command exists:

```bash
node packages/cli/dist/bin.js catalog list
```

Expected before Task 7: command missing. Expected after Task 7: exit `0`.

- [ ] **Step 2: Expand CI paths and smoke commands**

Add paths:

```text
packages/core/**
packages/connectors/**
packages/cli/**
```

Add after build:

```yaml
- name: CLI smoke tests
  run: |
    node packages/cli/dist/bin.js catalog list
    node packages/cli/dist/bin.js catalog get web-platform --json
    node packages/cli/dist/bin.js connector health web-platform --json
```

- [ ] **Step 3: Document operational boundaries**

README documents:

- Catalog is read-only.
- Legacy connectors are visible but non-selectable.
- Health is diagnostic, not routing.
- `catalog snapshot` writes only to the requested SQLite database.
- No connector code is executed.

- [ ] **Step 4: Run full verification**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:repository
node packages/cli/dist/bin.js catalog list
node packages/cli/dist/bin.js catalog get web-platform --json
node packages/cli/dist/bin.js connector health web-platform --json
```

Expected: all exit `0`.

- [ ] **Step 5: Audit scope**

Confirm changed files contain no:

```text
router
provider scoring
MCP invocation
package installation
child_process
shell execution
fetch
HTTP client
project mutation
```

- [ ] **Step 6: Commit**

```bash
git add .github README.md docs packages
git commit -m "ci(catalog): verify read-only catalog core"
```

---

## Final Review Checklist

- [ ] All Issue #5 requirements map to a task above.
- [ ] No placeholders remain in the plan.
- [ ] Public signatures match across tasks.
- [ ] Snapshot ID excludes `createdAt`.
- [ ] Legacy connectors never become selectable.
- [ ] Missing or malformed manifests never silently disappear.
- [ ] SQLite is replaceable through `CatalogSnapshotStore`.
- [ ] CLI query commands do not write files.
- [ ] Only `catalog snapshot` creates or updates a local database.
- [ ] No connector runtime artifact is imported or executed.
- [ ] Final PR receives a fresh independent review before merge.
