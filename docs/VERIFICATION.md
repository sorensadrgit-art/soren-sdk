# Verification

Verification plans are generic and vendor-neutral. They can require contract, typecheck, unit, integration, build, repository, CLI smoke, accessibility, reduced-motion, browser, bundle, performance, security, visual, and connector gates.

| State | Meaning |
| --- | --- |
| passed | Trusted runner result succeeded with verified artifacts. |
| failed | Runner reported failure. |
| not-run | No result exists. |
| not-required | Explicit deterministic waiver. |
| blocked | Prerequisite missing. |
| cancelled | Runner cancelled. |
| timed-out | Runner time limit expired. |
| unverified | Integrity or trust cannot be established. |

Required gates do not become passed from agent narration. Missing results remain `not-run`.
