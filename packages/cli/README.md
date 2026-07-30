# @soren-sdk/cli

The executable interface for Soren SDK's read-only project inspector, deterministic capability router, and connector catalog, with optional local SQLite catalog-snapshot persistence.

## Commands

```bash
soren-sdk inspect
soren-sdk inspect ../my-project
soren-sdk inspect ../my-project --json

soren-sdk route \
  --project ../my-project \
  --capability platform.css-transition

soren-sdk route \
  --project ../my-project \
  --capability motion.layout \
  --capability motion.timeline \
  --optional motion.svg \
  --preferred motion \
  --preferred gsap \
  --forbidden web-platform \
  --max-providers 2 \
  --scope hero \
  --property transform \
  --json

soren-sdk catalog list
soren-sdk catalog list --json
soren-sdk catalog get web-platform --json
soren-sdk connector health web-platform --json
soren-sdk catalog snapshot --json
soren-sdk catalog snapshot --database .soren-sdk/catalog.sqlite --json
```

From this monorepo:

```bash
pnpm build
pnpm soren-sdk -- route --capability platform.css-transition --json
```

Or run the built binary directly:

```bash
node packages/cli/dist/bin.js route \
  --capability motion.timeline \
  --preferred gsap \
  --json
```

## Route flags

- `--project <path>` — project to inspect; defaults to `.`
- `--capability <id>` — required capability; repeatable and required at least once
- `--optional <id>` — optional capability; repeatable and never forces a provider
- `--preferred <provider>` — preferred-provider order; repeatable
- `--forbidden <provider>` — forbidden provider; repeatable
- `--max-providers <n>` — non-negative maximum third-party provider count; defaults to `3`
- `--scope <scope>` — explicit ownership scope applied to requested capabilities
- `--property <property>` — explicit ownership property applied to requested capabilities
- `--json` — canonical stable JSON output

The route command accepts explicit capability IDs only. It does not infer capabilities from prose.

A valid Route Plan returns exit code `0` even when its status is `blocked`, `needs-input`, or `no-sdk`. Those are valid deterministic routing outcomes rather than CLI failures.

## Route output

Human output includes:

- Route status
- Selected providers and reason codes
- Rejected providers and reason codes
- Ownership assignments
- Constraint results
- Required input
- Plan, project, catalog, and policy identifiers

JSON output is a contract-valid `RoutePlan` in canonical JSON order.

## Inspect output

`inspect` produces a contract-valid, content-addressed `ProjectSnapshot` containing:

- Static Git revision metadata
- Package manager and lockfile digest
- Workspace packages
- Runtime and framework versions
- Dependency inventory
- Selected configuration and policy file digests
- Browser and runtime targets
- Warnings for ambiguous or unverifiable state

The snapshot ID excludes the absolute root and creation time, so identical clones produce the same ID.

## Exit codes

- `0` — successful inspection, route, query, or snapshot operation
- `1` — inspection, routing, catalog, contract, or storage failure
- `2` — invalid arguments or unknown connector

## Output

Human-readable output is the default. `--json` emits canonical stable JSON followed by a newline.

## Write boundary

The following commands are read-only:

- `inspect`
- `route`
- `catalog list`
- `catalog get`
- `connector health`
- `catalog snapshot` without `--database`

Only `catalog snapshot --database <path>` creates or updates a file, and it writes only to the requested SQLite database.

The CLI does not install packages, execute Git or package-manager commands, invoke connector tools or MCP servers, access the network, follow project symlinks, or mutate application source files.
