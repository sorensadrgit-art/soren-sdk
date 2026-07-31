import {
  assertContract,
  digestJson,
  type CapabilityCatalog,
  type CatalogSnapshot,
  type JsonValue,
  type PolicyDocument,
  type ProjectSnapshot,
  type RoutePlan,
  type RouteRequest
} from "@soren-sdk/contracts";

import type {
  CatalogReader,
  ConnectorHealthReport,
  ConnectorRecord
} from "../catalog/types.js";
import { collectProviderCandidates } from "./candidates.js";
import {
  assignCapabilities,
  buildOwnershipPlan,
  findOwnershipConflict
} from "./ownership.js";
import { getPolicySnapshotId, PHASE_4_POLICY } from "./policy.js";
import type {
  ProviderCandidate,
  ProviderRejection,
  RouteInput,
  RouteReasonCode,
  RouteResolution
} from "./types.js";

interface NormalizedCapabilities {
  requested: string[];
  required: string[];
  optional: string[];
}

interface ProviderSetScore {
  providerCount: number;
  dependencyReuse: number;
  preferredWeight: number;
  support: number;
  confidence: number;
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function catalogRecordId(record: ConnectorRecord): string {
  return record.kind === "schema-v2"
    ? record.manifest.connector.id
    : record.directoryId;
}

function missingHealth(connectorId: string): ConnectorHealthReport {
  return {
    connectorId,
    state: "missing",
    selectable: false,
    reviewStatus: null,
    blockers: [],
    warnings: [],
    errors: ["missing"]
  };
}

function materializeCatalog(
  catalog: CatalogReader,
  createdAt: string
): {
  capabilities: CapabilityCatalog;
  catalog: CatalogReader;
  snapshot: CatalogSnapshot;
} {
  const capabilities = structuredClone(catalog.getCapabilityCatalog());
  assertContract<CapabilityCatalog>("capability-catalog", capabilities);
  const records = catalog.list().map((record) => structuredClone(record));
  const healthReports = new Map<string, ConnectorHealthReport>();
  for (const record of records) {
    const connectorId = catalogRecordId(record);
    if (!healthReports.has(connectorId)) {
      healthReports.set(connectorId, structuredClone(catalog.health(connectorId)));
    }
  }

  const capabilityCatalogDigest = digestJson(json(capabilities));
  const connectors = records
    .filter(
      (record): record is Extract<ConnectorRecord, { kind: "schema-v2" }> =>
        record.kind === "schema-v2"
    )
    .map((record) => {
      const connectorId = record.manifest.connector.id;
      const health = healthReports.get(connectorId) ?? missingHealth(connectorId);
      return {
        id: connectorId,
        connectorVersion: record.manifest.connectorVersion,
        digest: digestJson(json({ manifest: record.manifest, health })),
        reviewStatus: record.manifest.connector.reviewStatus,
        selectable: record.manifest.connector.selectable
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const snapshot: CatalogSnapshot = {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "catalog-snapshot",
    snapshotId: digestJson(json({ capabilityCatalogDigest, connectors })),
    createdAt,
    capabilityCatalogDigest,
    connectors
  };
  assertContract<CatalogSnapshot>("catalog-snapshot", snapshot);

  const recordsById = new Map<string, ConnectorRecord>();
  for (const record of records) {
    recordsById.set(record.directoryId, record);
    recordsById.set(catalogRecordId(record), record);
  }
  const frozenCatalog: CatalogReader = {
    getCapabilityCatalog: () => capabilities,
    list: () => [...records],
    get: (connectorId) => recordsById.get(connectorId),
    health: (connectorId) =>
      healthReports.get(connectorId) ?? missingHealth(connectorId),
    snapshot: (nextCreatedAt = createdAt) => ({
      ...snapshot,
      createdAt: nextCreatedAt,
      connectors: snapshot.connectors.map((connector) => ({ ...connector }))
    })
  };
  return { capabilities, catalog: frozenCatalog, snapshot };
}

function supportRank(value: "fallback" | "primary" | "secondary"): number {
  switch (value) {
    case "primary":
      return 3;
    case "secondary":
      return 2;
    case "fallback":
      return 1;
  }
}

function normalizeCapabilities(request: RouteRequest): NormalizedCapabilities {
  const required = new Set<string>();
  const optional = new Set<string>();
  for (const capability of request.capabilities) {
    if (capability.required) {
      required.add(capability.id);
      optional.delete(capability.id);
    } else if (!required.has(capability.id)) {
      optional.add(capability.id);
    }
  }
  return {
    requested: [...new Set([...required, ...optional])].sort(),
    required: [...required].sort(),
    optional: [...optional].sort()
  };
}

function constraint(
  code: string,
  status: "failed" | "not-applicable" | "passed",
  message: string
): RoutePlan["constraints"][number] {
  return { code, status, message };
}

function rejection(
  providerId: string,
  reasonCode: RouteReasonCode,
  reason: string
): ProviderRejection {
  return { providerId, reasonCode, reason };
}

function stableRejections(
  values: readonly ProviderRejection[]
): RoutePlan["rejectedProviders"] {
  const byProvider = new Map<string, ProviderRejection>();
  for (const value of values) {
    const existing = byProvider.get(value.providerId);
    if (existing === undefined || rejectionPriority(value) < rejectionPriority(existing)) {
      byProvider.set(value.providerId, value);
    }
  }
  return [...byProvider.values()].sort((left, right) =>
    left.providerId.localeCompare(right.providerId)
  );
}

function rejectionPriority(value: ProviderRejection): number {
  const priorities: Record<RouteReasonCode, number> = {
    OWNERSHIP_CONFLICT: 0,
    PROVIDER_LIMIT_EXCEEDED: 1,
    ENVIRONMENT_UNSUPPORTED: 2,
    FORBIDDEN_PROVIDER: 3,
    POLICY_DENIED: 4,
    CONNECTOR_UNHEALTHY: 5,
    CAPABILITY_NOT_SUPPORTED: 6,
    MATERIAL_TIE: 7,
    ALTERNATIVE_NOT_NEEDED: 8,
    EXISTING_DEPENDENCY_REUSE: 9,
    PREFERRED_PROVIDER: 10,
    MINIMAL_PROVIDER_SET: 11,
    CAPABILITY_MATCH: 12,
    NATIVE_CAPABILITY_MATCH: 13
  };
  return priorities[value.reasonCode];
}

function knownCapabilityIds(catalog: CapabilityCatalog): Set<string> {
  return new Set(catalog.capabilities.map((capability) => capability.id));
}

function nativeCapabilityIds(catalog: CapabilityCatalog): Set<string> {
  return new Set(
    catalog.capabilities
      .filter((capability) => capability.native)
      .map((capability) => capability.id)
  );
}

function providerSubsets(
  candidates: readonly ProviderCandidate[]
): ProviderCandidate[][] {
  const subsets: ProviderCandidate[][] = [];
  const count = 1 << candidates.length;
  for (let mask = 1; mask < count; mask += 1) {
    const subset: ProviderCandidate[] = [];
    for (let index = 0; index < candidates.length; index += 1) {
      if ((mask & (1 << index)) !== 0) {
        const candidate = candidates[index];
        if (candidate !== undefined) subset.push(candidate);
      }
    }
    subsets.push(
      subset.sort((left, right) => left.providerId.localeCompare(right.providerId))
    );
  }
  return subsets;
}

function covers(
  providerSet: readonly ProviderCandidate[],
  capabilityIds: readonly string[]
): boolean {
  return capabilityIds.every((capabilityId) =>
    providerSet.some((provider) => provider.claims.has(capabilityId))
  );
}

function scoreProviderSet(
  providerSet: readonly ProviderCandidate[],
  capabilityIds: readonly string[]
): ProviderSetScore {
  let support = 0;
  let confidence = 0;
  for (const capabilityId of capabilityIds) {
    const claims = providerSet
      .map((provider) => provider.claims.get(capabilityId))
      .filter(
        (claim): claim is NonNullable<typeof claim> => claim !== undefined
      );
    support += Math.max(...claims.map((claim) => supportRank(claim.support)));
    confidence += Math.max(...claims.map((claim) => claim.confidence));
  }
  return {
    providerCount: providerSet.length,
    dependencyReuse: providerSet.filter((provider) => provider.dependencyReuse)
      .length,
    preferredWeight: providerSet.reduce(
      (total, provider) =>
        total +
        (provider.preferredRank === null ? 0 : 10_000 - provider.preferredRank),
      0
    ),
    support,
    confidence
  };
}

function compareScores(left: ProviderSetScore, right: ProviderSetScore): number {
  if (left.providerCount !== right.providerCount) {
    return left.providerCount - right.providerCount;
  }
  if (left.dependencyReuse !== right.dependencyReuse) {
    return right.dependencyReuse - left.dependencyReuse;
  }
  if (left.preferredWeight !== right.preferredWeight) {
    return right.preferredWeight - left.preferredWeight;
  }
  if (left.support !== right.support) return right.support - left.support;
  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }
  return 0;
}

function equalScores(left: ProviderSetScore, right: ProviderSetScore): boolean {
  return compareScores(left, right) === 0;
}

function selectedReason(candidate: ProviderCandidate): {
  reasonCode: RouteReasonCode;
  reason: string;
} {
  if (candidate.dependencyReuse) {
    return {
      reasonCode: "EXISTING_DEPENDENCY_REUSE",
      reason: `Provider "${candidate.providerId}" satisfies required capabilities and reuses an installed approved dependency.`
    };
  }
  if (candidate.preferredRank !== null) {
    return {
      reasonCode: "PREFERRED_PROVIDER",
      reason: `Provider "${candidate.providerId}" satisfies required capabilities and appears in preferred-provider order.`
    };
  }
  return {
    reasonCode: "CAPABILITY_MATCH",
    reason: `Provider "${candidate.providerId}" satisfies its assigned required capabilities.`
  };
}

function selectedProviderRecords(
  selected: readonly ProviderCandidate[],
  assignments: ReturnType<typeof assignCapabilities>
): RoutePlan["selectedProviders"] {
  return selected
    .map((candidate) => {
      const reason = selectedReason(candidate);
      return {
        providerId: candidate.providerId,
        integrationIds: [...candidate.integrationIds].sort(),
        capabilities: assignments
          .filter((assignment) => assignment.providerId === candidate.providerId)
          .map((assignment) => assignment.capabilityId)
          .sort(),
        ...reason
      };
    })
    .sort((left, right) => left.providerId.localeCompare(right.providerId));
}

function blockedResolution(
  code: RouteReasonCode,
  message: string,
  rejections: readonly ProviderRejection[],
  baseConstraints: RoutePlan["constraints"]
): RouteResolution {
  return {
    status: "blocked",
    selectedProviders: [],
    rejectedProviders: stableRejections(rejections),
    ownership: [],
    constraints: [
      ...baseConstraints,
      constraint(code, "failed", message)
    ],
    uncertainty: 0,
    requiredInput: []
  };
}

function chooseFailure(
  rejections: readonly ProviderRejection[]
): ProviderRejection {
  return [...rejections].sort(
    (left, right) =>
      rejectionPriority(left) - rejectionPriority(right) ||
      left.providerId.localeCompare(right.providerId)
  )[0] ??
    rejection(
      "router",
      "CAPABILITY_NOT_SUPPORTED",
      "No healthy policy-approved provider covers all required capabilities."
    );
}

function finalizePlan(input: {
  request: RouteRequest;
  project: ProjectSnapshot;
  catalogSnapshot: CatalogSnapshot;
  policySnapshotId: RoutePlan["policySnapshotId"];
  requestedCapabilities: string[];
  resolution: RouteResolution;
  createdAt: string;
}): RoutePlan {
  const stablePayload = {
    schemaVersion: "1.0.0-draft.1" as const,
    contractKind: "route-plan" as const,
    status: input.resolution.status,
    requestId: input.request.requestId,
    projectSnapshotId: input.project.snapshotId,
    catalogSnapshotId: input.catalogSnapshot.snapshotId,
    policySnapshotId: input.policySnapshotId,
    requestedCapabilities: [...input.requestedCapabilities].sort(),
    selectedProviders: input.resolution.selectedProviders,
    rejectedProviders: input.resolution.rejectedProviders,
    ownership: input.resolution.ownership,
    constraints: input.resolution.constraints,
    uncertainty: input.resolution.uncertainty,
    requiredInput: [...input.resolution.requiredInput].sort()
  };
  const digest = digestJson(json(stablePayload));
  const plan: RoutePlan = {
    ...stablePayload,
    planId: `route_${digest.slice("sha256:".length, "sha256:".length + 24)}`,
    createdAt: input.createdAt,
    digest
  };
  assertContract<RoutePlan>("route-plan", plan);
  return plan;
}

function resolveRoute(input: {
  request: RouteRequest;
  project: ProjectSnapshot;
  catalog: RouteInput["catalog"];
  policy: PolicyDocument;
  capabilities: CapabilityCatalog;
  normalized: NormalizedCapabilities;
}): RouteResolution {
  const baseConstraints: RoutePlan["constraints"] = [
    constraint(
      "PROJECT_SNAPSHOT_MATCH",
      "passed",
      "The Route Request references the supplied Project Snapshot."
    )
  ];
  const known = knownCapabilityIds(input.capabilities);
  const unknownRequired = input.normalized.required.filter(
    (capabilityId) => !known.has(capabilityId)
  );
  if (unknownRequired.length > 0) {
    return blockedResolution(
      "CAPABILITY_NOT_SUPPORTED",
      `Unknown required capabilities: ${unknownRequired.join(", ")}.`,
      [],
      baseConstraints
    );
  }

  if (input.normalized.required.length === 0) {
    return {
      status: "no-sdk",
      selectedProviders: [],
      rejectedProviders: [],
      ownership: [],
      constraints: [
        ...baseConstraints,
        constraint(
          "CAPABILITY_NOT_SUPPORTED",
          "not-applicable",
          "No required capability needs a provider; optional capabilities do not force SDK selection."
        )
      ],
      uncertainty: 0,
      requiredInput: []
    };
  }

  const nativeIds = nativeCapabilityIds(input.capabilities);
  const nativeRequired = input.normalized.required.filter((capabilityId) =>
    nativeIds.has(capabilityId)
  );
  const sdkRequired = input.normalized.required.filter(
    (capabilityId) => !nativeIds.has(capabilityId)
  );
  const requiredSet = new Set(input.normalized.required);
  const collection = collectProviderCandidates({
    catalog: input.catalog,
    project: input.project,
    request: input.request,
    policy: input.policy,
    requiredCapabilityIds: requiredSet
  });
  const webPlatform = collection.candidates.find(
    (candidate) => candidate.providerId === "web-platform"
  );
  if (
    nativeRequired.length > 0 &&
    (webPlatform === undefined || !covers([webPlatform], nativeRequired))
  ) {
    const nativeFailure =
      collection.rejections.find(
        (item) => item.providerId === "web-platform"
      ) ??
      rejection(
        "web-platform",
        "CAPABILITY_NOT_SUPPORTED",
        "Web Platform does not cover all required native capabilities."
      );
    return blockedResolution(
      nativeFailure.reasonCode,
      nativeFailure.reason,
      collection.rejections,
      baseConstraints
    );
  }

  if (sdkRequired.length === 0) {
    if (webPlatform === undefined) {
      return blockedResolution(
        "CAPABILITY_NOT_SUPPORTED",
        "Web Platform is unavailable for required native capabilities.",
        collection.rejections,
        baseConstraints
      );
    }
    const assignments = assignCapabilities(
      [webPlatform],
      nativeRequired,
      input.capabilities,
      input.request
    );
    return {
      status: "native",
      selectedProviders: [],
      rejectedProviders: stableRejections(collection.rejections),
      ownership: buildOwnershipPlan(assignments),
      constraints: [
        ...baseConstraints,
        constraint(
          "NATIVE_CAPABILITY_MATCH",
          "passed",
          "All required capabilities are satisfied by the Web Platform."
        ),
        constraint(
          "MINIMAL_PROVIDER_SET",
          "passed",
          "No third-party provider is required."
        ),
        constraint(
          "OWNERSHIP_CONFLICT",
          "passed",
          "Native ownership assignments do not conflict."
        )
      ],
      uncertainty: 0,
      requiredInput: []
    };
  }

  const thirdParty = collection.candidates.filter(
    (candidate) => candidate.providerId !== "web-platform"
  );
  const sufficientSets = providerSubsets(thirdParty).filter((providerSet) =>
    covers(providerSet, sdkRequired)
  );
  if (sufficientSets.length === 0) {
    const failure = chooseFailure(collection.rejections);
    return blockedResolution(
      failure.reasonCode,
      failure.reason,
      collection.rejections,
      baseConstraints
    );
  }

  const minimumProviderCount = Math.min(
    ...sufficientSets.map((providerSet) => providerSet.length)
  );
  if (minimumProviderCount > input.request.preferences.maxProviders) {
    return blockedResolution(
      "PROVIDER_LIMIT_EXCEEDED",
      `The smallest sufficient route requires ${minimumProviderCount} providers but maxProviders is ${input.request.preferences.maxProviders}.`,
      [
        ...collection.rejections,
        ...thirdParty.map((candidate) =>
          rejection(
            candidate.providerId,
            "PROVIDER_LIMIT_EXCEEDED",
            `Provider "${candidate.providerId}" is part of a route exceeding maxProviders.`
          )
        )
      ],
      baseConstraints
    );
  }

  const permittedSets = sufficientSets.filter(
    (providerSet) =>
      providerSet.length <= input.request.preferences.maxProviders
  );
  const scored = permittedSets
    .map((providerSet) => ({
      providerSet,
      score: scoreProviderSet(providerSet, sdkRequired)
    }))
    .sort((left, right) => {
      const score = compareScores(left.score, right.score);
      if (score !== 0) return score;
      return left.providerSet
        .map((provider) => provider.providerId)
        .join("\u0000")
        .localeCompare(
          right.providerSet.map((provider) => provider.providerId).join("\u0000")
        );
    });
  const best = scored[0];
  if (best === undefined) {
    return blockedResolution(
      "CAPABILITY_NOT_SUPPORTED",
      "No sufficient provider route remains after hard constraints.",
      collection.rejections,
      baseConstraints
    );
  }
  const tied = scored.filter((item) => equalScores(item.score, best.score));
  if (tied.length > 1) {
    return {
      status: "needs-input",
      selectedProviders: [],
      rejectedProviders: stableRejections([
        ...collection.rejections,
        ...tied.flatMap((item) =>
          item.providerSet.map((candidate) =>
            rejection(
              candidate.providerId,
              "MATERIAL_TIE",
              `Provider "${candidate.providerId}" participates in a materially different tied route.`
            )
          )
        )
      ]),
      ownership: [],
      constraints: [
        ...baseConstraints,
        constraint(
          "MATERIAL_TIE",
          "failed",
          "Materially different provider architectures remain tied."
        )
      ],
      uncertainty: 1,
      requiredInput: ["preferred provider"]
    };
  }

  const internallySelected = [
    ...(webPlatform === undefined || nativeRequired.length === 0
      ? []
      : [webPlatform]),
    ...best.providerSet
  ];
  const assignments = assignCapabilities(
    internallySelected,
    input.normalized.required,
    input.capabilities,
    input.request
  );
  const conflict = findOwnershipConflict(assignments);
  if (conflict !== null) {
    const [left, right] = conflict;
    return blockedResolution(
      "OWNERSHIP_CONFLICT",
      `Providers "${left.providerId}" and "${right.providerId}" both require exclusive ownership of ${left.scope}/${left.property}.`,
      [
        ...collection.rejections,
        rejection(
          left.providerId,
          "OWNERSHIP_CONFLICT",
          `Exclusive ownership conflicts at ${left.scope}/${left.property}.`
        ),
        rejection(
          right.providerId,
          "OWNERSHIP_CONFLICT",
          `Exclusive ownership conflicts at ${right.scope}/${right.property}.`
        )
      ],
      baseConstraints
    );
  }

  const selectedIds = new Set(internallySelected.map((candidate) => candidate.providerId));
  const alternativeRejections = collection.candidates
    .filter((candidate) => !selectedIds.has(candidate.providerId))
    .map((candidate) =>
      rejection(
        candidate.providerId,
        "ALTERNATIVE_NOT_NEEDED",
        `Provider "${candidate.providerId}" is not needed by the smallest sufficient route.`
      )
    );

  return {
    status: "selected",
    selectedProviders: selectedProviderRecords(best.providerSet, assignments),
    rejectedProviders: stableRejections([
      ...collection.rejections,
      ...alternativeRejections
    ]),
    ownership: buildOwnershipPlan(assignments),
    constraints: [
      ...baseConstraints,
      constraint(
        "CAPABILITY_MATCH",
        "passed",
        "Every required capability is covered by a healthy policy-approved provider."
      ),
      constraint(
        "PROVIDER_LIMIT_EXCEEDED",
        "passed",
        `Selected ${best.providerSet.length} provider(s) within maxProviders ${input.request.preferences.maxProviders}.`
      ),
      constraint(
        "MINIMAL_PROVIDER_SET",
        "passed",
        "The selected third-party provider set is the smallest sufficient set."
      ),
      constraint(
        "OWNERSHIP_CONFLICT",
        "passed",
        "Selected providers have no exclusive same-scope/property conflict."
      )
    ],
    uncertainty: 0,
    requiredInput: []
  };
}

export function routeCapabilities(input: RouteInput): RoutePlan {
  assertContract<RouteRequest>("route-request", input.request);
  assertContract<ProjectSnapshot>("project-snapshot", input.project);
  const policy = input.policy ?? PHASE_4_POLICY;
  assertContract<PolicyDocument>("policy", policy);
  if (input.request.projectSnapshotId !== input.project.snapshotId) {
    throw new Error(
      "Route Request project snapshot does not match the supplied Project Snapshot."
    );
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const materialized = materializeCatalog(input.catalog, createdAt);
  const normalized = normalizeCapabilities(input.request);
  const resolution = resolveRoute({
    request: input.request,
    project: input.project,
    catalog: materialized.catalog,
    policy,
    capabilities: materialized.capabilities,
    normalized
  });

  return finalizePlan({
    request: input.request,
    project: input.project,
    catalogSnapshot: materialized.snapshot,
    policySnapshotId: getPolicySnapshotId(policy),
    requestedCapabilities: normalized.requested,
    resolution,
    createdAt
  });
}
