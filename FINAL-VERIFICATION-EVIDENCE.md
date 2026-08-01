# Final Verification Evidence

Implementation audited: `1e22f21c47cf387a9d646f0fc3c0ab5f2d0866c8`
Environment: Node `v24.18.1`, pnpm `11.18.0`

## Clean checkout verification

`pnpm install --frozen-lockfile` passed.

Both independent required verification passes completed with exit status 0:

| Command | Pass 1 | Pass 2 |
|---|---:|---:|
| `pnpm lint` | 0 | 0 |
| `pnpm typecheck` | 0 | 0 |
| `pnpm test` | 0 | 0 |
| `pnpm build` | 0 | 0 |
| `pnpm validate:repository` | 0 | 0 |
| `pnpm smoke:cli` | 0 | 0 |

A machine-readable full-suite count run on the same audited SHA reported 63/63 suites and 170/170 tests passed, with 0 failures.

## Additional package and focused verification

All package test commands passed independently for `@soren-sdk/contracts`, `connectors`, `core`, `evidence`, `planner`, `sandbox`, `apply`, `verification`, and `cli`.

A focused Vitest selection covering matching security, recovery/restart, concurrency-related, fixture, protocol and equivalence references passed with exit status 0. This is not evidence that the required dedicated security corpus, restart-recovery, or protocol-surface equivalence suites executed: no dedicated runners were discovered. The security corpus JSON parses and declares 31 cases.

## Remote CI evidence

- Workflow: Contracts CI
- Run ID: `30712327154`
- Check-run ID: `91401849771`
- Conclusion: success
- URL: https://github.com/sorensadrgit-art/soren-sdk/actions/runs/30712327154

Logs are retained locally as `.verification-*.log` during review and are not committed.