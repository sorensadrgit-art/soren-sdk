# Phase 6 service adapter matrix

| Boundary | Production behavior |
| --- | --- |
| Phase 5 configuration | Public validated configuration service |
| Phase 5 policy | Public resolved-policy service with digest/provenance |
| Phase 5 lockfile | Public lock read and drift inspection |
| Phase 8 planning | Reviewed plan identity and immutable digest |
| Phase 8 verification/evidence | Reviewed required-check, unverified, redaction, blocked and failure state |
| Apply | Disabled on all public surfaces |

No adapter deep-imports Phase 5 internals.