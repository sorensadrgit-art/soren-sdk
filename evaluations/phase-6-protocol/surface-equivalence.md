# Phase 6 Surface Equivalence Matrix

Transport-only metadata stripped before comparison:

- `meta.surface`
- `meta.correlationId`
- `correlationId`

| Use case | Application | SDK in-process | SDK HTTP | REST | MCP | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Catalog list | real | real | real | real | real | equivalent |
| Catalog get | real | real | real | real | real | equivalent |
| Connector health | real | real | real | real | real | equivalent |
| Project inspect | real | real | real | real | real | equivalent with allowed roots |
| Route | fake unavailable | fake unavailable | fake unavailable | fake unavailable | fake unavailable | equivalent |
| Policy resolve | fake unavailable | fake unavailable | fake unavailable | fake unavailable | fake unavailable | equivalent |
| Lock inspect | fake unavailable | fake unavailable | fake unavailable | fake unavailable | fake unavailable | equivalent |
| Context select | fake unavailable | fake unavailable | fake unavailable | fake unavailable | fake unavailable | equivalent |
| Plan create | fake unavailable | fake unavailable | fake unavailable | fake unavailable | fake unavailable | equivalent |
| Evidence query | fake unavailable | fake unavailable | fake unavailable | fake unavailable | fake unavailable | equivalent |

Negative coverage:

- Unsupported REST endpoint returns `METHOD_NOT_FOUND`.
- Unsupported MCP protocol version returns `PROTOCOL_VERSION_UNSUPPORTED`.
- Unknown MCP tool returns `METHOD_NOT_FOUND`.
- Missing JSON content type returns `CONTENT_TYPE_UNSUPPORTED`.
- Oversized request returns `BODY_TOO_LARGE`.
- Project-root traversal/out-of-allowlist returns `PROJECT_ROOT_DENIED`.
- Authorization denial returns `AUTHORIZATION_DENIED`.
