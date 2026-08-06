# Soren SDK 0.1 Post-Merge Stabilization Baseline

* **Target SHA:** `7d51a4e832948d0da27edb3e1a81a8dca6c37f5d`
* **Node:** `>=24`
* **pnpm:** `11.17.0`
* **CI Run:** `31066932920`
* **Deferred:** PR #46 (Wait for 0.1 stabilization before recreating)

## Ledger of Unresolved P1/P2 Findings

| Finding ID | Severity | Source | File & Line | Failure Scenario | Repro Status | Current Status | Target Workstream | Branch Name | Owner | Verification Required |
|---|---|---|---|---|---|---|---|---|---|---|
| F-001 | P1 | PR #45 (https://github.com/sorensadrgit-art/soren-sdk/pull/45) | `run-grants.ts:29` | Missing workspace isolation; tools can escape context | Reproduced | Unresolved | 2 | `fix/trusted-workspace-scope` | Jules | Mismatching `rootDigest` denies authorization |
| F-002 | P1 | PR #47 (https://github.com/sorensadrgit-art/soren-sdk/pull/47) | `read-only-gateway.ts:145` | Protocol attributes not enforced at dispatch | Reproduced | Unresolved | 3 | `fix/provider-protocol-context` | Jules | Provider receives context & rejects mismatch |
| F-003 | P2 | PR #48 (https://github.com/sorensadrgit-art/soren-sdk/pull/48) | `audit.ts:4` | Audit trails missing correlation across grants/tools | Reproduced | Unresolved | 4 | `fix/attributable-audit-chain` | Jules | Valid digest with 5 correlation fields |
| F-004 | P2 | PR #48 (https://github.com/sorensadrgit-art/soren-sdk/pull/48) | `read-only-gateway.ts:153` | Missing reservation-time quota denial auditing | Reproduced | Unresolved | 4 | `fix/attributable-audit-chain` | Jules | `CALL_QUOTA_DENIED` inserted during reservation failure |
| F-005 | P2 | PR #48 (https://github.com/sorensadrgit-art/soren-sdk/pull/48) | `read-only-gateway.ts:179` | Missing response-commit quota denial auditing | Reproduced | Unresolved | 4 | `fix/attributable-audit-chain` | Jules | `RESPONSE_QUOTA_DENIED` inserted during commit failure |
| F-006 | P2 | PR #45 (https://github.com/sorensadrgit-art/soren-sdk/pull/45) | `sqlite-run-grants.ts:116` | Unbounded/missing retry for benign SQLite revision races | Reproduced | Unresolved | 5 | `fix/sqlite-reservation-retry` | Jules | 3-attempt bounded retry with concurrency test |
| F-007 | P1 | PR #47 (https://github.com/sorensadrgit-art/soren-sdk/pull/47) | `evidence-envelope.schema.json:1` | Evidence schema collision across versions | Reproduced | Unresolved | 6 | `fix/evidence-contract-v2` | Jules | V2 schema rejects v1 schema ID and vice versa |
| F-008 | P1 | PR #47 (https://github.com/sorensadrgit-art/soren-sdk/pull/47) | `evidence-envelope.schema.json:1` | Missing explicit principal preservation | Reproduced | Unresolved | 6 | `fix/evidence-contract-v2` | Jules | Principal required and digest changes on mutation |
| F-009 | P2 | PR #48 (https://github.com/sorensadrgit-art/soren-sdk/pull/48) | `application.ts:28` | Fallback to fakes in production defaults | Reproduced | Unresolved | 7 | `fix/production-application-composition` | Jules | Missing adapters throw `UNAVAILABLE` |
| F-010 | P1 | PR #48 (https://github.com/sorensadrgit-art/soren-sdk/pull/48) | `apply/src/index.ts:1` | Apply and mutation vectors potentially exposed | Reproduced | Unresolved | 8 | `hardening/read-only-release-boundary` | Jules | Fakes completely removed from public export |
| F-011 | P1 | PR #45 (https://github.com/sorensadrgit-art/soren-sdk/pull/45) | `run-grants.ts:192` | In-memory concurrent-reservation issue | Reproduced | Resolved | - | - | Jules | Replaced by SQLite retry fix; no longer active |
