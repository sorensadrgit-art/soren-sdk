# Phase 7 Gateway Foundation Design

## Goal

Replace caller-authenticated run grants with one authoritative, opaque, quota-aware grant foundation that later Phase 7 cancellation, consent, streaming, audit, and context-envelope work can build on without duplicating security state.

## Scope

This slice implements only the authorization and accounting foundation:

- opaque process-safe grant handles;
- canonical immutable stored grant records;
- provider-neutral grant repository and atomic reservation port;
- active, revoked, expired, consumed, and exhausted lifecycle states;
- deterministic binding to provider, run, normalized tool IDs, inventory digest, protocol negotiation digest, input/output schema identity, issue time, expiry, call quota, per-response quota, and total-response quota;
- atomic call and byte reservations before provider dispatch;
- fail-closed cross-store, forged, altered, unknown, revoked, expired, replayed, and exhausted grant behavior.

This slice does not yet implement async streaming, AbortSignal propagation, remote-content consent, durable audit storage, or untrusted context envelopes. Those are later slices that consume this foundation.

## Architecture

### `run-grants.ts`

Defines the public opaque `RunGrant` handle, grant issuance request, immutable stored record, lifecycle state, reservation record, repository port, and `RunGrantStore` service.

The caller receives only an opaque grant ID and store binding. Authorization data never comes from the call request. `RunGrantStore` loads the canonical record from the repository for every authorization or accounting transition.

### `tool-protocol.ts`

Owns inventory normalization, protocol negotiation, schema identity, and deterministic digests. Grant issuance binds to the existing reviewed protocol negotiation and tool schema contract rather than creating another format.

### `read-only-gateway.ts`

Owns gateway authorization order. For this slice, the provider remains materialized and synchronous for compatibility. The gateway:

1. loads the canonical grant record;
2. validates lifecycle, provider, inventory, negotiation, tool, and schema bindings;
3. atomically reserves one call and a bounded response-byte allowance;
4. dispatches the provider;
5. validates and measures the result;
6. atomically commits bytes or releases only unused byte capacity according to documented failure semantics.

### `context-gateway.ts`

Remains a compatibility facade that re-exports the new focused modules and preserves existing public names where that does not weaken the boundary.

## Grant lifecycle

- `active`: can reserve work.
- `revoked`: no new reservations; active-call cancellation arrives in the next slice.
- `expired`: set when an authoritative read observes the expiry boundary.
- `consumed`: one-call grant successfully reserved once.
- `exhausted`: multi-call or byte quota can no longer reserve work.

Unknown and cross-store handles are indistinguishable from denied grants at the gateway boundary.

## Atomic accounting semantics

The repository exposes one atomic `reserveCall` transition. It verifies the current record and reserves:

- one call;
- the smaller of per-response allowance and remaining total-response allowance.

Provider failure consumes the call because dispatch occurred. Unused byte reservation is released. Successful output commits its exact UTF-8 JSON byte count. Invalid, oversized, or schema-invalid output consumes the call but commits no response bytes. A repository implementation must guarantee that two concurrent callers cannot reserve the final call or final byte allowance.

## Security invariants

- Callers cannot construct or modify authorization state.
- Grant records are immutable snapshots; state transitions replace records atomically.
- Tool IDs are normalized and deduplicated before persistence.
- Inventory digest includes descriptions, read-only flags, remote-content risk classification, protocol metadata, extensions, and input/output schema identity.
- Negotiation digest and selected protocol/extensions are persisted in the grant.
- Negative, non-integer, unsafe, or overflowing quotas are rejected.
- A provider mismatch, inventory drift, negotiation drift, schema drift, lifecycle denial, or tool denial occurs before provider dispatch.
- No shell, network, credential, package-install, publish, deploy, or filesystem-mutation capability is added.

## Error handling

Public gateway errors remain stable and non-secret. Detailed internal repository causes are not exposed to callers. Repository write failure is fail-closed: no provider dispatch may occur without a committed reservation.

## Testing

The slice uses test-driven development. Required regressions cover:

- fabricated and copied handles;
- altered IDs and cross-store use;
- provider, inventory, negotiation, and schema drift;
- revocation and expiry;
- one-call and multi-call exhaustion;
- concurrent final-call reservation;
- total and per-response byte accounting;
- provider failure accounting;
- invalid quotas and safe-integer overflow;
- repository save failure before dispatch;
- reload through a persistence adapter.

## Follow-up slices

1. Bounded async provider execution, cancellation, kill-switch propagation, revocation during calls, and authority-backed project-content consent.
2. Durable redacted audit sink, immutable untrusted context envelopes, composition adapters, migration tests, and final Node 24 verification.
