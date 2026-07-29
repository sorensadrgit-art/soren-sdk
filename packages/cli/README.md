# @soren-sdk/cli

The first executable interface for Soren SDK: a read-only catalog CLI with optional local SQLite snapshot persistence.

## Commands

```bash
soren-sdk catalog list
soren-sdk catalog list --json

soren-sdk catalog get web-platform
soren-sdk catalog get web-platform --json

soren-sdk connector health web-platform
soren-sdk connector health web-platform --json

soren-sdk catalog snapshot --json
soren-sdk catalog snapshot --database .soren-sdk/catalog.sqlite --json
```

From this monorepo:

```bash
pnpm build
pnpm soren-sdk -- catalog list
```

Or run the built binary directly:

```bash
node packages/cli/dist/bin.js catalog list
```

## Exit codes

- `0` — successful query or snapshot operation
- `1` — invalid catalog or storage failure
- `2` — invalid arguments or unknown connector

## Output

Human-readable output is the default.

`--json` emits canonical, stable JSON followed by a newline.

Catalog list lines use:

```text
<connector-id>    <record-kind>    <selectable>
```

## Write boundary

The following commands are read-only:

- `catalog list`
- `catalog get`
- `connector health`
- `catalog snapshot` without `--database`

Only this command writes a file:

```bash
soren-sdk catalog snapshot --database <path>
```

It creates or updates only the requested local SQLite database. The CLI does not install packages, execute connector tools, invoke MCP servers, access the network, or mutate application source files.

## Connector behavior

- Legacy connector manifests are visible but non-selectable.
- Health output is diagnostic; it does not make routing decisions.
- Invalid catalogs fail instead of silently omitting broken connectors.
- Connector documents are parsed as data and never imported or executed.
