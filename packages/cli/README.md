# @soren-sdk/cli

The executable interface for Soren SDK's read-only project inspector and connector catalog, with optional local SQLite catalog-snapshot persistence.

## Commands

```bash
soren-sdk inspect
soren-sdk inspect ../my-project
soren-sdk inspect ../my-project --json

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
pnpm soren-sdk -- inspect --json
```

Or run the built binary directly:

```bash
node packages/cli/dist/bin.js inspect --json
```

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

- `0` — successful inspection, query, or snapshot operation
- `1` — inspection, catalog, or storage failure
- `2` — invalid arguments or unknown connector

## Output

Human-readable output is the default. `--json` emits canonical stable JSON followed by a newline.

## Write boundary

The following commands are read-only:

- `inspect`
- `catalog list`
- `catalog get`
- `connector health`
- `catalog snapshot` without `--database`

Only `catalog snapshot --database <path>` creates or updates a file, and it writes only to the requested SQLite database.

The CLI does not install packages, execute Git or package-manager commands, invoke connector tools or MCP servers, access the network, follow project symlinks, or mutate application source files.
