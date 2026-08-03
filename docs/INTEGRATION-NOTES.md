# Parallel Integration Notes — Phase 9

This file documents the exact local ports defined in Phase 9 and their
future mappings. No unfinished Phase 5 or Phase 8 internals are imported;
only the stable contracts from `@soren-sdk/contracts` are used.

## 1. `ApprovedPlanProvider`

```ts
interface ApprovedPlanProvider {
  getApprovedPlan(executionPlanId: string): Promise<{
    executionPlan: ExecutionPlan;
    approval: ApplyApproval;
  } | null>;
}
```

Fake: `InMemoryApprovedPlanProvider` in `packages/apply/src/ports-fakes.ts`.

Future mapping: The Phase 8 planning/evidence subsystem will publish
approved immutable execution plans. The provider adapter will read the
approved plan artifact and its bound approval document.

## 2. `ApplyEvidenceSink`

```ts
interface ApplyEvidenceSink {
  record(event: ApplyEvidenceEvent): Promise<void>;
  list(runId: string): Promise<ApplyEvidenceEvent[]>;
}
```

Fake: `InMemoryEvidenceSink` in `packages/apply/src/ports-fakes.ts`.

Future mapping: The Phase 8 evidence envelope will consume apply events
(preparation, approval verification, sandbox identity, before snapshot,
operation events, after snapshot, diff, rollback, cancellation,
resource-limit, and final-result) and persist them as evidence artifacts.

## 3. `ResolvedPolicyProvider`

```ts
interface ResolvedPolicyProvider {
  getPolicySnapshot(policyId: string): Promise<{
    policyId: string;
    digest: Digest;
    document: unknown;
  } | null>;
}
```

Fake: `InMemoryResolvedPolicyProvider` in `packages/apply/src/ports-fakes.ts`.

Future mapping: Phase 5 policy resolution will supply the resolved policy
snapshot and its digest.

## 4. `ProjectSnapshotProvider`

```ts
interface ProjectSnapshotProvider {
  getProjectSnapshot(snapshotId: Digest): Promise<ProjectSnapshot | null>;
}
```

Fake: `InMemoryProjectSnapshotProvider` in `packages/apply/src/ports-fakes.ts`.

Future mapping: Phase 3 project inspector will supply the current project
snapshot for drift checks.

## 5. `SandboxPolicyProvider`

```ts
interface SandboxPolicyProvider {
  getSandboxPolicy(policyId: string): Promise<SandboxPolicy | null>;
}
```

Fake: `InMemorySandboxPolicyProvider` in `packages/apply/src/ports-fakes.ts`.

Future mapping: The workspace configuration / control plane will supply the
sandbox policy document.

## 6. VCS isolation

```ts
interface VcsIsolationProvider {
  inspect(root: string): Promise<VcsState>;
  createIsolatedWorkspace(
    request: IsolatedWorkspaceRequest
  ): Promise<IsolatedWorkspace>;
}
```

Phase 9 provides deterministic fakes (`DeterministicVcsIsolationFake`,
`TempCopyIsolationFake`) in `packages/sandbox/src/vcs-isolation-fakes.ts`.
A first real adapter based on temporary-copy isolation is the intended
next step. Never write to protected branches or the original workspace by
default.

## 7. Constraints

- Do not import unfinished Phase 5 or Phase 8 internals.
- Use only the stable contracts from `@soren-sdk/contracts`.
- Keep the original workspace untouched by default.
- Command execution and network access remain disabled until the
  coordinator approves exposure after independent security review.