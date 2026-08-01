# Planning

Planning is read-only. `ExecutionPlanner.create` receives immutable project, catalog, policy, and route references plus approved intent. It emits a deterministic `ExecutionPlan` with only proposed operations. It never runs an `argv`, writes a project file, installs a package, opens a network connection, or resolves a credential.

A plan is `ready` only when its objective and all required inputs are present and no step is policy-denied. `needs-input` and `blocked` are valid, reviewable outcomes. Plans contain hashes and references, never raw project source or secret values.

`compare` must run before a future apply phase. Any snapshot, route, selected context, constraint, lockfile, or runner-capability difference is drift.
