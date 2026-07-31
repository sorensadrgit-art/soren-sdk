# Phase 7 design: context broker and read-only tool gateway

## Scope and security boundary

Phase 7 is a data-only, deterministic core service. It accepts caller-provided connector records, source records, skill documents, and tool-provider interfaces. Every such input is untrusted data. The broker does not fetch URLs, execute commands, write project files, install packages, invoke MCP transports, or access credentials.

The only call boundary is a caller-supplied read-only provider fake or adapter. An adapter is disabled unless its provider ID is explicitly allowlisted by the immutable run grant. Registry discovery is metadata only and can never activate a provider or change a grant.

## Contracts

`ContextRequest` contains a request ID, project/catalog/policy snapshot digests, requested connector IDs, requested context categories, and maximum items. `SelectedContext` contains only source identifiers, origin, content digest, freshness state, category, and content treated as untrusted data. It never returns executable instructions or grant material.

`SourceRecord` must provide a SHA-256 content digest, reviewed flag, expiry timestamp, allowed categories, and content. The broker computes the digest with `@soren-sdk/contracts`, rejects mismatch and stale records, selects only requested categories, and returns a canonical ordering by connector, category, then source ID.

`AgentSkillRecord` is parsed as data. It must have valid YAML frontmatter, a matching source digest, a nonempty declarative description, and no executable body or `allowed-tools` authority. Scripts and unpinned skills are rejected.

`RunGrant` is immutable after construction. It binds run ID, provider ID, approved read-only tool IDs, permitted data exposure, inventory digest, issuance/expiry times, and a canonical digest. Grant requests cannot include mutation, shell, filesystem write, credentials, or remote project-content without both policy permission and explicit consent. The initial implementation rejects all remote project content and all non-read-only tool declarations.

## Gateway

A `ReadOnlyToolProvider` interface exposes an inventory and a read-only call method. Provider protocol versions are explicitly negotiated by intersection. Any unsupported version fails closed.

The gateway snapshots the canonical tool inventory before use. A later inventory with a different digest is rejected and audited as `inventory-changed`; it is never silently accepted. Tool descriptions are retained only as untrusted metadata and do not grant permission.

Before every call, the gateway checks: kill switch, grant digest, run ID/provider match, expiry, exact inventory digest, exact approved tool ID, read-only declaration, and project-content exposure policy. Calls have a maximum response byte length and produce redacted audit events. The gateway never logs inputs, raw outputs, credentials, or token-like values.

The kill switch is in-memory and sticky. Once activated, no subsequent gateway call can reach a provider. The only fallback is a deterministic `blocked` result with a safe reason code.

## Prompt-injection boundary

Source text, skill markdown, registry data, and tool descriptions are data fields. The broker never interprets them as directives, policy changes, consent, URLs to fetch, tool selections, or execution plans. Context selection derives only from trusted request fields and caller policy/grant inputs.

## Tests

Deterministic fakes cover injection text, stale or digest-mismatched sources, skill validation, stable ordering, protocol mismatch, inventory change, self-grant attempts, expired grants, remote content denial, redacted audit entries, response limits, and the kill switch.
