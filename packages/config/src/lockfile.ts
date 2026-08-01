import { digestJson, validateContract } from "@soren-sdk/contracts";
import type { Digest, JsonValue, SorenSdkLock } from "@soren-sdk/contracts";

export type LockfileErrorCode =
  | "LOCK_CREDENTIAL_REJECTED"
  | "LOCK_ABSOLUTE_PATH_REJECTED";

export class LockfileError extends Error {
  readonly code: LockfileErrorCode;

  constructor(code: LockfileErrorCode, message: string) {
    super(message);
    this.name = "LockfileError";
    this.code = code;
  }
}

export interface SelectedIntegration {
  id: string;
  versionStatus: "not-applicable" | "resolved" | "unresolved";
  version?: string;
  digest?: string;
}

export interface SelectedConnector {
  id: string;
  connectorVersion: string;
  digest: Digest;
  integrations: SelectedIntegration[];
}

export interface CreateLockfileInput {
  projectSnapshotId: Digest;
  catalogSnapshotId: Digest;
  policySnapshotId: Digest;
  configDigest: Digest;
  routePlanId: string;
  routePlanDigest: Digest;
  capabilityOntologyVersion: string;
  connectors: SelectedConnector[];
  unavailable: Array<{ id: string; reasonCode: string; reason: string }>;
  generatedAt?: string;
}

export interface CurrentResolutionInputs {
  projectSnapshotId: Digest;
  catalogSnapshotId: Digest;
  policySnapshotId: Digest;
  configDigest: Digest;
  routePlanId: string;
  routePlanDigest: Digest;
  connectors?: SelectedConnector[];
}

export type LockValidationResult =
  | { ok: true; lock: SorenSdkLock }
  | { ok: false; issues: string[] };

export interface LockDrift {
  field: string;
  locked: string | undefined;
  current: string | undefined;
  severity: "critical" | "warning" | "info";
}

export interface LockDriftReport {
  inSync: boolean;
  drifts: LockDrift[];
}

const CREDENTIAL_PATTERN =
  /token|secret|password|credential|api[_-]?key|authorization/i;

const ABSOLUTE_PATH_PATTERN = /^(?:\/|[a-zA-Z]:[\\/])/;

function jsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function compareById(a: { id: string }, b: { id: string }): number {
  return a.id.localeCompare(b.id);
}

/** Normalize connector ordering and integration ordering for hashing. */
function normalizeConnectors(
  connectors: SelectedConnector[]
): SorenSdkLock["connectors"] {
  return [...connectors]
    .sort(compareById)
    .map((connector) => ({
      id: connector.id,
      connectorVersion: connector.connectorVersion,
      digest: connector.digest,
      integrations: [...connector.integrations].sort(compareById).map((i) => ({
        id: i.id,
        versionStatus: i.versionStatus,
        ...(i.version !== undefined ? { version: i.version } : {}),
        ...(i.digest !== undefined ? { digest: i.digest } : {}),
      })),
    }));
}

function normalizeUnavailable(
  unavailable: CreateLockfileInput["unavailable"]
): SorenSdkLock["unavailable"] {
  return [...unavailable]
    .sort(compareById)
    .map(({ id, reasonCode, reason }) => ({ id, reasonCode, reason }));
}

function normalizeLock(lock: Omit<SorenSdkLock, "digest">): Omit<SorenSdkLock, "digest"> {
  return {
    ...lock,
    connectors: normalizeConnectors(lock.connectors),
    unavailable: [...lock.unavailable].sort(compareById),
    protocolResolutions: [...lock.protocolResolutions].sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    runtimeResolutions: [...lock.runtimeResolutions].sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
  };
}

/**
 * Immutable digest of a lock: canonical JSON of the normalized lock with the
 * `generatedAt` (and digest) fields excluded, so a lock's identity is stable
 * across creation times and list ordering.
 */
export function computeLockDigest(lock: Omit<SorenSdkLock, "digest">): Digest {
  const normalized = normalizeLock(lock);
  const { generatedAt: _generatedAt, ...payload } = normalized;
  return digestJson(jsonValue(payload));
}

function* walkStrings(value: unknown): Iterable<string> {
  if (typeof value === "string") {
    yield value;
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      yield* walkStrings(item);
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) {
      yield* walkStrings(child);
    }
  }
}

function rejectSensitiveInput(input: CreateLockfileInput): void {
  for (const value of walkStrings(input)) {
    if (CREDENTIAL_PATTERN.test(value)) {
      throw new LockfileError(
        "LOCK_CREDENTIAL_REJECTED",
        `refusing to write a lockfile containing a credential-like value ("${value}")`
      );
    }
    if (ABSOLUTE_PATH_PATTERN.test(value)) {
      throw new LockfileError(
        "LOCK_ABSOLUTE_PATH_REJECTED",
        `refusing to write a lockfile containing an absolute path ("${value}")`
      );
    }
  }
}

/**
 * Creates, validates, and diff-checks `SorenSdkLock` lockfiles. The lock is
 * immutable: its digest covers every bound input except `generatedAt`, so any
 * tampering with a bound field is detected on validation.
 */
export class LockfileService {
  create(input: CreateLockfileInput): SorenSdkLock {
    rejectSensitiveInput(input);
    const lock: Omit<SorenSdkLock, "digest"> = {
      schemaVersion: "1.0.0-draft.1",
      contractKind: "soren-sdk-lock",
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      capabilityOntologyVersion: input.capabilityOntologyVersion,
      catalogSnapshotDigest: input.catalogSnapshotId,
      policySnapshotDigest: input.policySnapshotId,
      projectSnapshotDigest: input.projectSnapshotId,
      configDigest: input.configDigest,
      routePlanId: input.routePlanId,
      routePlanDigest: input.routePlanDigest,
      connectors: normalizeConnectors(input.connectors),
      unavailable: normalizeUnavailable(input.unavailable),
      protocolResolutions: [],
      runtimeResolutions: [],
    };
    return { ...lock, digest: computeLockDigest(lock) };
  }

  validate(lock: unknown): LockValidationResult {
    const schema = validateContract<SorenSdkLock>("soren-sdk-lock", lock);
    if (!schema.ok) {
      return {
        ok: false,
        issues: schema.issues.map(
          (issue) => `${issue.instancePath || "/"} ${issue.keyword}: ${issue.message}`
        ),
      };
    }
    const { digest, ...rest } = schema.value;
    const recomputed = computeLockDigest(rest);
    if (recomputed !== digest) {
      return {
        ok: false,
        issues: [
          `digest-mismatch: lock.digest ${digest} does not match the recomputed digest ${recomputed}`,
        ],
      };
    }
    return { ok: true, lock: schema.value };
  }

  compare(lock: SorenSdkLock, current: CurrentResolutionInputs): LockDriftReport {
    const drifts: LockDrift[] = [];

    const snapshots: Array<{
      field: string;
      locked: string;
      current: string;
    }> = [
      { field: "projectSnapshot", locked: lock.projectSnapshotDigest, current: current.projectSnapshotId },
      { field: "catalogSnapshot", locked: lock.catalogSnapshotDigest, current: current.catalogSnapshotId },
      { field: "policySnapshot", locked: lock.policySnapshotDigest, current: current.policySnapshotId },
      { field: "config", locked: lock.configDigest, current: current.configDigest },
      { field: "routePlan", locked: lock.routePlanDigest, current: current.routePlanDigest },
      { field: "routePlanId", locked: lock.routePlanId, current: current.routePlanId },
    ];
    for (const entry of snapshots) {
      if (entry.locked !== entry.current) {
        drifts.push({
          field: entry.field,
          locked: entry.locked,
          current: entry.current,
          severity: "critical",
        });
      }
    }

    const currentConnectors = current.connectors;
    if (currentConnectors !== undefined) {
      for (const lockedConnector of lock.connectors) {
        const currentConnector = currentConnectors.find(
          (connector) => connector.id === lockedConnector.id
        );
        if (currentConnector === undefined) {
          drifts.push({
            field: `connectors.${lockedConnector.id}`,
            locked: lockedConnector.id,
            current: undefined,
            severity: "critical",
          });
          continue;
        }
        const lockedIntegrationIds = new Set(
          lockedConnector.integrations.map((integration) => integration.id)
        );
        const currentIntegrationIds = new Set(
          currentConnector.integrations.map((integration) => integration.id)
        );
        for (const id of lockedIntegrationIds) {
          if (!currentIntegrationIds.has(id)) {
            drifts.push({
              field: `integrations.${lockedConnector.id}.${id}`,
              locked: id,
              current: undefined,
              severity: "warning",
            });
          }
        }
        for (const id of currentIntegrationIds) {
          if (!lockedIntegrationIds.has(id)) {
            drifts.push({
              field: `integrations.${lockedConnector.id}.${id}`,
              locked: undefined,
              current: id,
              severity: "warning",
            });
          }
        }
      }
      for (const currentConnector of currentConnectors) {
        const locked = lock.connectors.some(
          (connector) => connector.id === currentConnector.id
        );
        if (!locked) {
          drifts.push({
            field: `connectors.${currentConnector.id}`,
            locked: undefined,
            current: currentConnector.id,
            severity: "warning",
          });
        }
      }
    }

    return {
      inSync: !drifts.some((drift) => drift.severity === "critical"),
      drifts,
    };
  }
}
