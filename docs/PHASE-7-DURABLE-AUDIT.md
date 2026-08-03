# Phase 7 durable audit policy

The tool gateway writes redacted lifecycle records through the injected `AuditSink` port. `SqliteAuditSink` is the repository-approved durable local adapter. `InMemoryAuditSink` is a test fake only and implements the same interface.

Each record has a monotonic per-gateway sequence, an event code, stable run/provider/grant/tool/call identifiers, timestamp, `redacted: true`, and a content-addressed SHA-256 identity over those fields. Records deliberately exclude raw tool input, project content, provider output, credentials, secrets, authorization values, error bodies, and revocation reasons.

The policy is fail-closed. Before provider dispatch, failure to persist any required audit record rejects the call and prevents dispatch. After dispatch, an audit write failure rejects the call and the gateway's existing cancellation path is used where active work remains. A sink failure is surfaced only as `Audit sink unavailable.` so backend details are not leaked.

Required lifecycle codes include request, grant accepted or denied, dispatch, provider failure, cancellation, revocation, inventory drift, schema violation, response limit, timeout, and completion. SQLite records are ordered by `(run_id, sequence, id)` and validate their content-addressed identity before persistence.
