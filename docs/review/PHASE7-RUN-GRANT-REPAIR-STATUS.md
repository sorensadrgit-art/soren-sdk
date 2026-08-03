# Phase 7 Run-Grant Repair Status

Branch: `repair/phase7-run-grant-foundation`

This repair restores the missing production implementation required by the RED opaque-grant regressions merged through PR #43.

Current slice:

- opaque process-local grant handles;
- canonical immutable repository records;
- copied, fabricated, unknown, cross-store, expired, and restarted-handle rejection;
- provider, inventory, protocol, tool, and quota-input validation.

Pending before readiness:

- exact Node 24 CI;
- atomic call and byte reservation transitions;
- lifecycle transitions and revocation;
- gateway integration over canonical grants;
- durable adapter semantics and final security review.

Decision: CHANGES REQUIRED.
