# Surface Equivalence Matrix

Audited implementation SHA: `1e22f21c47cf387a9d646f0fc3c0ab5f2d0866c8`

| Surface | Expected contract | Observed result | Status |
|---|---|---|---|
| Contracts | Canonical schemas/types shared by services | Contracts, planner, verification and evidence package tests passed | Pass |
| CLI | Plan-oriented, non-public-apply behavior | `pnpm smoke:cli` passed twice | Pass |
| Apply default construction | Disabled without a private capability | `APPLY_DISABLED` is exported and targeted apply security tests passed | Pass |
| Apply package public entrypoint | No test-only mutation escape hatch | Re-exports `apply-service` and `ports-fakes`; test factory reachable | Fail |
| Sandbox public entrypoint | No test fake port published | Re-exports `vcs-isolation-fakes` | Fail |
| Protocol/fixture/recovery behavior | Equivalent across supported paths and fixtures | No dedicated runnable protocol-equivalence or restart-recovery runner was discovered | Not verified |

The failing entrypoint surfaces are the same H-01 finding in the review report. They prevent equivalence between the intended disabled public apply surface and the actual package exports.