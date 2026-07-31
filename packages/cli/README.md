# @soren-sdk/cli

The executable interface for Soren SDK's read-only project inspector, connector catalog, and explicit-capability router, with optional local SQLite catalog-snapshot persistence.

## Commands

```bash
soren-sdk inspect
soren-sdk inspect ../my-project
soren-sdk inspect ../my-project --json

soren-sdk route \
  --project ../my-project \
  --capability platform.css-transition \
  --json

soren-sdk route \
  --project ../my-react-project \
  --capability motion.layout \
  --preferred motion \
  --scope card-grid \
  --property layout

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
pnpm soren-sdk -- route --capability platform.css-animation --json
```

Or run the built binary directly:

```bash
node packages/cli/dist/bin.js inspect --json
node packages/cli/dist/bin.js route --capability platform.css-transition --json
```

## Route input

`route` accepts structured capability IDs only. It does not infer capabilities from prose.

Supported repeatable flags:

- `--capability <id>` for required capabilities
- `--optional <id>` for optional capabilities
- `--preferred <provider-id>`
- `--forbidden <provider-id>`

Other routing flags:

- `--project <path>` defaults to `.`
- `--max-providers <positive-integer>` defaults to `2`
- `--scope <scope>`
- `--property <property>`
- `--json`

The Phase 4 router considers only healthy approved Web Platform, Motion, and GSAP connectors. Motion's React-specific claims require a safely provable React `18.2` or newer declaration.

A valid Route Plan may have status `native`, `selected`, `no-sdk`, `needs-input`, or `blocked`. All valid Route Plans return exit code `0`; blocked and needs-input are routing results, not CLI failures.

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

- `0` — successful inspection, catalog operation, or valid Route Plan
- `1` — inspection, catalog, storage, contract, or internal routing failure
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
