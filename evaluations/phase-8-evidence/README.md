# Phase 8 Evidence Evaluations

| Attack or edge case | Expected result |
| --- | --- |
| Agent-authored passed claim | Rejected because no runner result exists. |
| Wrong plan ID or digest | Ingest rejects the result. |
| Omitted hard gate | Required check remains `not-run`. |
| Artifact modified | Digest mismatch rejects ingest. |
| Independent result ordering | Identical immutable evidence digest. |
| Redaction of state or identity | Rejected. |
| Stale project/catalog/policy/route data | Planner drift report is blocking. |
| Runner timeout or cancellation | State is preserved, never coerced to passed. |
