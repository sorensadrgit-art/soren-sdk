# MCP Server

Phase 6 provides a read-only MCP surface over the same `SorenApplication` use cases. It does not connect to third-party MCP servers.

Supported MCP protocol versions:

- `2025-06-18`

Tools:

- `soren_catalog_list`
- `soren_catalog_get`
- `soren_connector_health`
- `soren_project_inspect`
- `soren_route`
- `soren_policy_resolve`
- `soren_lock_inspect`
- `soren_context_select`
- `soren_plan_create`
- `soren_evidence_query`

Resources:

- `soren://catalog/connectors`
- `soren://protocol/capabilities`

All tools are declared read-only. Parallel-phase use cases are marked unavailable in capability metadata and return deterministic typed unavailable outputs through the application layer.
