# Phase 6 Design and Implementation Plan

## Goal

Expose the same Soren application services through direct TypeScript calls, a TypeScript SDK, versioned REST endpoints, and read-only MCP tools/resources.

## Boundary

`@soren-sdk/application` is the only semantic use-case boundary for Phase 6. Protocol packages may parse, route, authenticate, authorize, enforce limits, time out, and serialize envelopes, but they may not reimplement catalog, inspection, routing, policy, context, planning, or evidence behavior.

## Packages

- `@soren-sdk/application`: service interface, envelopes, auth/authorization ports, default wiring over current catalog/project inspector, and deterministic fakes for unfinished phases.
- `@soren-sdk/protocol-server`: REST and MCP adapters over `SorenApplication`; importing modules does not start a listener.
- `@soren-sdk/sdk`: stable TypeScript client shape with in-process and HTTP transports.

## Fakes

Neighboring services remain isolated behind ports:

- `ResolvedPolicyProvider`
- `ContextSelectionProvider`
- `PlanEvidenceProvider`
- `ApplyProvider`

Temporary fake adapters return deterministic unavailable results with request digests and replacement-port metadata. They do not import unfinished package internals.

## Security Controls

- Stable protocol success and error envelopes.
- Correlation IDs are transport metadata and excluded from canonical digests.
- JSON content-type enforcement for POST.
- Explicit body-size limits.
- Timeout support.
- Project-root allowlist for REST project inspection.
- Provider-neutral authenticator and authorizer ports.
- Deny-by-default authorization implementation supplied.
- No stack traces or credentials in protocol responses.
- No server auto-start on import.
- MCP tools declared read-only.

## Verification Plan

Run:

- `pnpm install --frozen-lockfile`
- `pnpm --filter @soren-sdk/application test`
- `pnpm --filter @soren-sdk/protocol-server test`
- `pnpm --filter @soren-sdk/sdk test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm validate:repository`

If the environment lacks pnpm, use Corepack to activate the repository-pinned package manager before running the same commands.
