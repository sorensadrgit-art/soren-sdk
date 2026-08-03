# Phase 5 — Policy, Configuration, and Lockfile Evaluations

This directory holds adversarial evaluation cases for the Phase 5 work:
configuration discovery/parsing (`@soren-sdk/config`), tighten-only policy
resolution, and immutable lockfile creation/validation.

## Files

- `adversarial-cases.json` — a machine-readable corpus of adversarial scenarios
  with the expected outcome for each. The `cases` array uses the same
  `{ id, description, expected }` shape as the other phase evaluation corpora.

## Scope

The corpus targets the Phase 5 surface:

- configuration parsing of untrusted YAML/JSON (aliases, duplicate keys,
  prototype pollution, non-JSON numerics),
- tighten-only policy resolution (weakening attempts, unknown fields),
- lockfile safety (credential inclusion, absolute paths, tampering, digest
  instability, atomic writes, symlink/`..` output guards).

## How to use

Each case is `{ id, description, expected }`. The `expected` value is the
desired behavior of the SDK when it encounters the scenario, e.g. `rejected`
(the operation must fail), `blocked` (a defensive guard must trigger), or
`detected` (the invariant must be observed). Future phases can turn these cases
into executable tests or fuzz harnesses.
