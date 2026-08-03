# Agent 2 Fix Log

## 2026-08-01

1. Based `review/security-mutation-agent-2` on `review/phase9-master-fixes` at `7a0b1f6bdb796622bf70368721b0ea7403c3a1c8`.
2. Carried Phase 7 review revisions through `698bc71adbcc4da3c29efc3509e0bb92b854118a`, resolving the expected delete/modify conflict because Phase 9 had removed the Phase 7 gateway file.
3. Preserved normalized tool-ID grant digests, deduplication, provider identity validation, tool-description inventory addressing, UTF-8 response limits, inventory drift rejection, read-only checks, and kill switch behavior.
4. Exported the context gateway from `@soren-sdk/core` and added deterministic context UTF-8 byte selection limits.
5. Removed mutable global sandbox factory dependency and replaced it with constructor-injected `SandboxProvider`.
6. Removed the public `setEnabledForTesting()` enablement switch. The normal service remains disabled; deterministic test construction uses a private capability.
7. Added internal frozen preparation identity binding. Fabricated, copied, modified, unknown, cross-instance, and reused preparations are rejected before mutation.
8. Fixed rollback cleanup for parent directories created implicitly by file creation. Cleanup is deepest-first and only removes directories not in the before snapshot. Final snapshot digest verification remains strict.
9. Added preparation-forgery regression tests and updated pre-existing test fixtures away from global sandbox replacement.

No Phase 5 configuration/lockfile internals, Phase 6 protocol-server internals, or Phase 8 planner/evidence internals were edited.
