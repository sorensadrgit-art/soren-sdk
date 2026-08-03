# Phases 5-9 Inventory

Audited 2026-08-02 against `review/phases-5-9-master-antigravity` at `e077cf9378b6cf277ffacd436d7d37b542565668`.

| PR | Head | Decision | Notes |
|---|---|---|---|
| #24 | e636d35a78e132e6344ec6cca9f294fa22afa3ae | selectively reused / incomplete | Phase 5, 6, and 8 work exists but production application composition still uses fake providers. |
| #32 | e077cf9378b6cf277ffacd436d7d37b542565668 | blocked | Draft integration branch. |
| #37 | c76fd63b30e8d76756d20d46a52ec95a649f5669 | selectively reused only | Runtime limits and fixture integrity concepts are useful; durable recovery was reverted and final repair leaves stale test API migration. |
| #38 | 5bc69ec365500872d585e2ab0870976ce2fa0f93 | integrated baseline | Protocol negotiation and schema validation are represented by current head. |
| #27/#28/#26/#33/#34/#25/#29 | divergent Phase 7 candidates | blocked pending reconciliation | Each collides in `packages/core/src/context-gateway.ts`; none may be wholesale cherry-picked. |
