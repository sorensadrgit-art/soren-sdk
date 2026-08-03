# Phase 7 Tool Gateway Grant Accounting

## Grant limits

A `RunGrant` may set the following non-negative safe-integer limits:

- `maxCalls`: maximum provider invocations.
- `maxTotalResponseBytes`: maximum committed UTF-8 bytes across JSON responses.
- `maxResponseBytes`: maximum UTF-8 bytes for any one JSON response.
- `expiresAt`: optional ISO timestamp deadline. Omission means the grant has no grant-level deadline.

`maxResponseBytes` cannot exceed the gateway-wide 65,536-byte response cap. Existing inventory binding, normalized tool IDs, digest validation, read-only checks, remote-project-content policy, inventory-drift rejection, and kill-switch behavior remain mandatory.

## Authoritative accounting and reservations

`RunGrantStore` is the authority for active state, revocation, counters, and reservations. Gateway callers receive an opaque `grantId`; they do not submit mutable counters or a grant object to a provider call.

Before invoking a provider, the gateway atomically reserves one call and a bounded response-byte allocation. The allocation is the lesser of the per-response cap and the currently available total-byte quota. A second concurrent call observes the reservation and cannot consume capacity already reserved by the first.

On a compliant response, the reservation is committed with the actual serialized UTF-8 JSON byte count. Unused reserved bytes are released. The total counter therefore records actual response bytes, not reservation ceilings.

## Failure semantics

A reserved call is consumed once provider execution begins. This prevents retrying provider failures until a grant succeeds.

- Provider failure or invalid/unserializable response: retain the consumed call, release the response-byte reservation, record a failure audit event, and rethrow.
- Response larger than the reservation, grant per-response limit, total-byte capacity, or 65,536-byte gateway cap: retain the consumed call, release the response-byte reservation, record `RESPONSE_TOO_LARGE`, and reject the response.
- Authorization, inventory, revocation, expiration, and quota checks happen before reservation and provider execution. They neither invoke the provider nor consume a call.

All numeric limits and counters reject negative, fractional, non-finite, and unsafe-integer values. Counter additions are checked for overflow.
