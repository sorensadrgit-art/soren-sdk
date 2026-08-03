# Phase 7 Gateway Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace caller-authenticated Phase 7 grants with an authoritative opaque grant store and atomic quota accounting.

**Architecture:** Split the current `context-gateway.ts` monolith into focused protocol, grant, and gateway modules. Preserve `context-gateway.ts` as a compatibility facade while moving authorization state into a provider-neutral repository port and one canonical `RunGrantStore`.

**Tech Stack:** TypeScript 6, Vitest 4, existing `@soren-sdk/contracts` canonical JSON and digest utilities, Node 24 CI.

## Global Constraints

- No production code before a failing test.
- No `any`, `@ts-ignore`, disabled tests, shell execution, network access, credentials, package installation, publishing, deployment, or project mutation.
- Keep `@soren-sdk/core` provider-neutral with no new runtime dependency beyond `@soren-sdk/contracts`.
- Do not implement streaming, cancellation, remote-content consent, durable auditing, or context envelopes in this slice.
- Public errors must not expose repository internals or authorization data.

---

### Task 1: Opaque Grant Contract and Forgery Rejection

**Files:**
- Create: `packages/core/src/run-grants.ts`
- Create: `packages/core/test/run-grants.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:

```ts
export interface RunGrant {
  readonly id: string;
}

export type RunGrantState =
  | "active"
  | "revoked"
  | "expired"
  | "consumed"
  | "exhausted";

export interface RunGrantRepository {
  issue(record: StoredRunGrant): void;
  read(storeId: string, grantId: string): StoredRunGrant | undefined;
  transition(input: GrantTransition): StoredRunGrant;
}
```

- [ ] **Step 1: Write failing opaque-handle tests**

Add tests that issue a grant, then reject `{ id: valid.id }`, a frozen copy, an unknown ID, and a handle issued by another store.

```ts
it("rejects copied and cross-store grant handles", () => {
  const first = createStore("first");
  const second = createStore("second");
  const grant = first.issue(validRequest(), inventory(), NOW);

  expect(first.authorize({ id: grant.id }, NOW)).toBeUndefined();
  expect(first.authorize(Object.freeze({ ...grant }), NOW)).toBeUndefined();
  expect(second.authorize(grant, NOW)).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @soren-sdk/core exec vitest run test/run-grants.test.ts --reporter=verbose
```

Expected: FAIL because `RunGrantStore` and opaque ownership do not exist.

- [ ] **Step 3: Implement minimal opaque ownership**

Use a store-specific unforgeable binding held outside the public handle. Persist only the opaque ID and canonical record; never accept caller permission fields.

- [ ] **Step 4: Re-run focused test and verify GREEN**

```bash
pnpm --filter @soren-sdk/core exec vitest run test/run-grants.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/run-grants.ts packages/core/src/index.ts packages/core/test/run-grants.test.ts
git commit -m "feat(core): add opaque canonical run grants"
```

---

### Task 2: Protocol, Inventory, and Schema Binding

**Files:**
- Create: `packages/core/src/tool-protocol.ts`
- Modify: `packages/core/src/run-grants.ts`
- Modify: `packages/core/test/run-grants.test.ts`
- Modify: `packages/core/src/context-gateway.ts`

**Interfaces:**
- Consumes existing `ToolInventory`, `ToolDefinition`, `NegotiationResult`, and schema descriptors.
- Produces:

```ts
export interface StoredRunGrant {
  readonly id: string;
  readonly storeId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly toolIds: readonly string[];
  readonly inventoryDigest: Digest;
  readonly protocolVersion: string;
  readonly extensions: readonly string[];
  readonly negotiationDigest: Digest;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly maxCalls: number;
  readonly maxResponseBytes: number;
  readonly maxTotalResponseBytes: number;
  readonly callsUsed: number;
  readonly responseBytesUsed: number;
  readonly responseBytesReserved: number;
  readonly state: RunGrantState;
  readonly revision: number;
}
```

- [ ] **Step 1: Add failing binding tests**

Test provider mismatch, tool-description drift, protocol downgrade, extension drift, input-schema drift, output-schema drift, duplicate tool normalization, and invalid negotiation digest.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @soren-sdk/core exec vitest run test/run-grants.test.ts --reporter=verbose
```

- [ ] **Step 3: Extract protocol normalization**

Move inventory and negotiation digest logic from `context-gateway.ts` into `tool-protocol.ts`. Ensure schema descriptors and extensions are included in canonical inventory identity.

- [ ] **Step 4: Bind issuance to canonical protocol data**

`RunGrantStore.issue()` accepts an issuance request plus current inventory and stores normalized tool IDs, selected protocol, sorted extensions, negotiation digest, and inventory digest.

- [ ] **Step 5: Verify GREEN and commit**

```bash
pnpm --filter @soren-sdk/core test
pnpm --filter @soren-sdk/core typecheck
git add packages/core/src/tool-protocol.ts packages/core/src/run-grants.ts packages/core/src/context-gateway.ts packages/core/test/run-grants.test.ts
git commit -m "feat(core): bind grants to protocol and schema identity"
```

---

### Task 3: Atomic Call and Byte Reservations

**Files:**
- Modify: `packages/core/src/run-grants.ts`
- Create: `packages/core/test/run-grant-concurrency.test.ts`

**Interfaces:**
- Produces:

```ts
export interface GrantReservation {
  readonly grantId: string;
  readonly reservationId: string;
  readonly recordRevision: number;
  readonly reservedResponseBytes: number;
}

export type GrantTransition =
  | { kind: "reserve"; storeId: string; grantId: string; now: string }
  | { kind: "commit"; reservation: GrantReservation; responseBytes: number }
  | { kind: "release-bytes"; reservation: GrantReservation }
  | { kind: "revoke"; storeId: string; grantId: string; at: string };
```

- [ ] **Step 1: Add failing concurrency tests**

Use a controllable barrier repository to invoke two reservations against a one-call grant. Assert exactly one succeeds. Add equivalent tests for the final total-byte allowance.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @soren-sdk/core exec vitest run test/run-grant-concurrency.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement atomic transition port**

The in-memory repository serializes transitions synchronously. The public repository contract documents compare-and-swap or transactional equivalence for durable adapters.

- [ ] **Step 4: Implement accounting semantics**

Reserve one call before dispatch. Provider failure keeps the call consumed and releases unused bytes. Successful results commit exact UTF-8 JSON bytes. Oversized or invalid results consume the call and commit zero bytes.

- [ ] **Step 5: Verify quotas and overflow**

Add tests for exact limit, one-over limit, zero/negative/non-integer limits, `Number.MAX_SAFE_INTEGER` overflow, revoked grants, expired grants, and multi-call exhaustion.

- [ ] **Step 6: Run and commit**

```bash
pnpm --filter @soren-sdk/core test
pnpm --filter @soren-sdk/core typecheck
git add packages/core/src/run-grants.ts packages/core/test/run-grant-concurrency.test.ts packages/core/test/run-grants.test.ts
git commit -m "feat(core): reserve grant calls and bytes atomically"
```

---

### Task 4: Gateway Integration

**Files:**
- Create: `packages/core/src/read-only-gateway.ts`
- Modify: `packages/core/src/context-gateway.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/test/context-gateway-master-review.test.ts`
- Create: `packages/core/test/read-only-gateway.test.ts`

**Interfaces:**
- Consumes `RunGrantStore`, `ToolInventory`, current synchronous `ReadOnlyToolProvider`, and existing schema validation.
- Produces:

```ts
export class ReadOnlyToolGateway {
  constructor(
    provider: ReadOnlyToolProvider,
    grants: RunGrantStore,
    auditTime: () => string
  );

  call(
    grant: RunGrant,
    toolId: string,
    input: JsonValue,
    now: string
  ): JsonValue;
}
```

- [ ] **Step 1: Add failing gateway tests**

Prove the gateway rejects fabricated handles, cross-store handles, provider drift, inventory drift, negotiation drift, schema drift, revoked grants, expired grants, exhausted grants, and repository reservation failure before dispatch.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @soren-sdk/core exec vitest run test/read-only-gateway.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement authorization order**

Load the canonical record, validate bindings, validate tool input, reserve quota, dispatch, validate output, measure UTF-8 JSON bytes, and commit or release accounting.

- [ ] **Step 4: Convert compatibility tests**

Update existing tests to issue grants through `RunGrantStore`; remove assertions against public permission fields because those fields no longer exist on the handle.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @soren-sdk/core test
pnpm --filter @soren-sdk/core typecheck
git add packages/core/src/read-only-gateway.ts packages/core/src/context-gateway.ts packages/core/src/index.ts packages/core/test
git commit -m "feat(core): enforce canonical grants in gateway"
```

---

### Task 5: Persistence Reload, Documentation, and Full Verification

**Files:**
- Create: `packages/core/test/run-grant-persistence.test.ts`
- Create: `docs/review/PHASE7-GATEWAY-FOUNDATION-REPORT.md`
- Create: `docs/review/PHASE7-GATEWAY-FOUNDATION-FIX-LOG.md`
- Create: `docs/review/PHASE7-GATEWAY-FOUNDATION-INTEGRATION-NOTES.md`

- [ ] **Step 1: Add failing persistence reload test**

Issue and consume a grant with one store instance, recreate the service with the same repository and store ID, and prove the lifecycle and counters remain authoritative.

- [ ] **Step 2: Verify RED, implement reload, verify GREEN**

```bash
pnpm --filter @soren-sdk/core exec vitest run test/run-grant-persistence.test.ts --reporter=verbose
```

- [ ] **Step 3: Document adapter requirements**

Document atomic transition, revision, lifecycle migration, failure semantics, redaction, and later Slice 2 integration points.

- [ ] **Step 4: Run full verification twice**

```bash
pnpm install --frozen-lockfile
pnpm --filter @soren-sdk/contracts test
pnpm --filter @soren-sdk/core test
pnpm --filter @soren-sdk/core typecheck
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:repository
pnpm smoke:cli

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:repository
pnpm smoke:cli
```

Expected: all commands exit 0 on Node 24.

- [ ] **Step 5: Commit and open draft PR**

```bash
git add docs/review packages/core
git commit -m "docs: record Phase 7 gateway foundation evidence"
git push origin review/phase7-gateway-foundation-codex
```

Open a draft PR targeting `review/phases-5-9-master-antigravity`. Include exact base/final SHAs, CI run, test counts, repository semantics, remaining Slice 2/3 work, and `CHANGES REQUIRED` or `READY FOR NEXT PHASE 7 SLICE`.
