# Phases 5-9 Integration Matrix

Audited implementation: `1e22f21c47cf387a9d646f0fc3c0ab5f2d0866c8`

| Required area | Integrated evidence | Decision |
|---|---|---|
| Phase 5 configuration, policy, lockfile | Core inspector and contracts validation coverage; `pnpm install --frozen-lockfile` passed | Integrated |
| Phase 6 real adapters | Connectors package exports filesystem catalog, health, snapshot, memory and SQLite stores; package tests passed | Integrated |
| Phase 7 authorization and safe execution | Gateway, canonical contracts, grants/consent, schemas, sandbox controls and audit-oriented tests present | Integrated |
| Phase 8 plans and evidence | Planner, verification and evidence packages provide deterministic plan/evidence paths; tests passed | Integrated |
| Phase 9 state and recovery | Apply preparation, approval, drift, recovery, rollback and limits are implemented and tested | Integrated with blocking hardening gap |

Branch integration method: full remote ref topology and `main...HEAD` history were inspected at the audited SHA. Only `review/phase9-master-fixes` and `worker/phase9-apply-sandbox-cline` are direct ancestors. The Phase 5 worker, Phase 6 worker, all nine Phase 7 branches, all three Phase 8 branches, and Phase 9 authoritative-state/runtime-limits/standalone-recovery branches are divergent or only partially patch-equivalent. No sampled commit message supplied a written accept, reject, or supersede rationale. Therefore required branch integration or deliberate-rejection justification is not verifiable.

Required remediation before merge: record explicit branch-by-branch integration or rejection decisions; remove test-only factories/fakes from production entrypoints, or relocate them to test-only modules that are not package exports; add runnable security-corpus and protocol-equivalence coverage; then rerun all verification.