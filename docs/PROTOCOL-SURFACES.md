# Protocol Surfaces

Phase 6 creates a transport-neutral application boundary and exposes it through TypeScript SDK, REST, and read-only MCP adapters.

The application boundary lives in `@soren-sdk/application` and owns the semantic use cases:

- catalog list/get
- connector health
- project inspection
- route
- policy resolution
- lock inspection
- context selection
- plan creation
- evidence query

Protocol adapters must not duplicate catalog, inspection, routing, policy, context, planning, or evidence behavior. They call `SorenApplication` and add only transport concerns such as HTTP routing, JSON parsing, MCP tool dispatch, content-type enforcement, size limits, authorization, timeouts, and error envelopes.

Unfinished neighboring services are represented by deterministic fake providers under `packages/application/src/adapters/fakes/`. They return typed unavailable results instead of importing unfinished internals.

Canonical equivalence compares results after removing transport-only metadata such as correlation IDs and surface names.
