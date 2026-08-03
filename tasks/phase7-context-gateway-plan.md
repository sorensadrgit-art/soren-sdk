# Phase 7 implementation plan

1. Add strict contracts for context requests, selected context, run grants, tool inventory, and audit events. Verify all unknown fields fail schema validation.
2. Implement a deterministic context broker that validates source digests/freshness and treats text as opaque data.
3. Implement Agent Skill data validation with no script execution path.
4. Implement protocol negotiation, immutable grants, inventory snapshots/diffs, kill switch, redacted audit events, and bounded read-only tool calls behind interfaces.
5. Add deterministic fake-provider positive and adversarial tests.
6. Run full CI and grep changed code for secret logging, arbitrary URL use, write APIs, process execution, and mutation APIs.

All external provider behavior is simulated in tests. No live service is called.
