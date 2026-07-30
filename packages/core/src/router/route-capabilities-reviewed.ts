import {
  assertContract,
  canonicalJson,
  digestJson,
  type JsonValue,
  type RoutePlan
} from "@soren-sdk/contracts";

import { collectProviderCandidates } from "./candidates.js";
import {
  assignCapabilities,
  buildOwnershipPlan,
  findOwnershipConflict
} from "./ownership.js";
import {
  getPhase4CompanionIntegrationIds,
  getRequiredCompanionIntegrationIds,
  PHASE_4_POLICY
} from "./policy.js";
import { routeCapabilities as routeCapabilitiesBase } from "./route-capabilities-public.js";
import type {
  ProviderCandidate,
  ProviderRejection,
  RouteInput,
  RouteReasonCode
} from "./types.js";

interface ProviderSetScore {
  providerCount: number;
  dependencyReuse: number;
  preferredWeight: number;
  support: number;
  confidence: number;
}

interface RankedValidSet {
  providerSet: ProviderCandidate[];
  score: ProviderSetScore;
  assignments: ReturnType<typeof assignCapabilities>;
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function requiredCapabilities(input: RouteInput): string[] {
  return [
    ...new Set(
      input.request.capabilities
        .filter((capability) => capability.required)
        .map((capability) => capability.id)
    )
  ].sort();
}

function requestedCapabilities(input: RouteInput): string[] {
  return [...new Set(input.request.capabilities.map((item) => item.id))].sort();
}

function requiredNativeCapabilities(input: RouteInput): string[] {
  const native = new Set(
    input.catalog
      .getCapabilityCatalog()
      .capabilities.filter((capability) => capability.native)
      .map((capability) => capability.id)
  );
  return requiredCapabilities(input).filter((capability) => native.has(capability));
}

function requiredSdkCapabilities(input: RouteInput): string[] {
  const native = new Set(requiredNativeCapabilities(input));
  return requiredCapabilities(input).filter((capability) => !native.has(capability));
}

function subsets(candidates: readonly ProviderCandidate[]): ProviderCandidate[][] {
  const result: ProviderCandidate[][] = [];
  const count = 1 << candidates.length;
  for (let mask = 1; mask < count; mask += 1) {
    const providerSet: ProviderCandidate[] = [];
    for (let index = 0; index < candidates.length; index += 1) {
      if ((mask & (1 << index)) !== 0) {
        const candidate = candidates[index];
        if (candidate !== undefined) providerSet.push(candidate);
      }
    }
    result.push(
      providerSet.sort((left, right) =>
        left.providerId.localeCompare(right.providerId)
      )
    );
  }
  return result;
}

function covers(
  providerSet: readonly ProviderCandidate[],
  capabilities: readonly string[]
): boolean {
  return capabilities.every((capability) =>
    providerSet.some((provider) => provider.claims.has(capability))
  );
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

function score(
  providerSet: readonly ProviderCandidate[],
  capabilities: readonly string[]
): ProviderSetScore {
  let support = 0;
  let confidence = 0;
  for (const capability of capabilities) {
    const claims = providerSet
      .map((provider) => provider.claims.get(capability))
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

function rankedValidSets(input: RouteInput): {
  collection: ReturnType<typeof collectProviderCandidates>;
  sets: RankedValidSet[];
} {
  const required = requiredCapabilities(input);
  const sdkRequired = requiredSdkCapabilities(input);
  const nativeRequired = requiredNativeCapabilities(input);
  const collection = collectProviderCandidates({
    catalog: input.catalog,
    project: input.project,
    request: input.request,
    policy: input.policy ?? PHASE_4_POLICY,
    requiredCapabilityIds: new Set(required)
  });
  const webPlatform = collection.candidates.find(
    (candidate) => candidate.providerId === "web-platform"
  );
  if (nativeRequired.length > 0 && webPlatform === undefined) {
    return { collection, sets: [] };
  }

  const sets = subsets(
    collection.candidates.filter(
      (candidate) => candidate.providerId !== "web-platform"
    )
  )
    .filter((providerSet) => covers(providerSet, sdkRequired))
    .filter(
      (providerSet) =>
        providerSet.length <= input.request.preferences.maxProviders
    )
    .map((providerSet): RankedValidSet | null => {
      const internallySelected = [
        ...(nativeRequired.length > 0 && webPlatform !== undefined
          ? [webPlatform]
          : []),
        ...providerSet
      ];
      const assignments = assignCapabilities(
        internallySelected,
        required,
        input.catalog.getCapabilityCatalog(),
        input.request
      );
      if (findOwnershipConflict(assignments) !== null) return null;
      return {
        providerSet,
        score: score(providerSet, sdkRequired),
        assignments
      };
    })
    .filter((candidate): candidate is RankedValidSet => candidate !== null)
    .sort((left, right) => {
      const result = compareScores(left.score, right.score);
      if (result !== 0) return result;
      return left.providerSet
        .map((provider) => provider.providerId)
        .join("\u0000")
        .localeCompare(
          right.providerSet.map((provider) => provider.providerId).join("\u0000")
        );
    });

  return { collection, sets };
}

function selectedIntegrationIds(
  candidate: ProviderCandidate,
  capabilities: readonly string[]
): string[] {
  const companionIds = getPhase4CompanionIntegrationIds(candidate.providerId);
  const baseIds = candidate.integrationIds.filter(
    (integrationId) => !companionIds.has(integrationId)
  );
  const requiredCompanions = capabilities.flatMap((capability) =>
    getRequiredCompanionIntegrationIds(candidate.providerId, capability)
  );
  return [...new Set([...baseIds, ...requiredCompanions])].sort();
}

function selectedReason(candidate: ProviderCandidate): {
  reasonCode: RouteReasonCode;
  reason: string;
} {
  if (candidate.dependencyReuse) {
    return {
      reasonCode: "EXISTING_DEPENDENCY_REUSE",
      reason: `Provider "${candidate.providerId}" satisfies required capabilities and reuses an installed compatible runtime dependency.`
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

function selectedProviders(
  selected: readonly ProviderCandidate[],
  assignments: ReturnType<typeof assignCapabilities>
): RoutePlan["selectedProviders"] {
  return selected
    .map((candidate) => {
      const capabilities = assignments
        .filter((assignment) => assignment.providerId === candidate.providerId)
        .map((assignment) => assignment.capabilityId)
        .sort();
      return {
        providerId: candidate.providerId,
        integrationIds: selectedIntegrationIds(candidate, capabilities),
        capabilities,
        ...selectedReason(candidate)
      };
    })
    .sort((left, right) => left.providerId.localeCompare(right.providerId));
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

function stableRejections(
  values: readonly ProviderRejection[]
): RoutePlan["rejectedProviders"] {
  const byProvider = new Map<string, ProviderRejection>();
  for (const value of values) {
    const existing = byProvider.get(value.providerId);
    if (
      existing === undefined ||
      rejectionPriority(value) < rejectionPriority(existing)
    ) {
      byProvider.set(value.providerId, value);
    }
  }
  return [...byProvider.values()].sort((left, right) =>
    left.providerId.localeCompare(right.providerId)
  );
}

function providerBehavior(
  candidate: ProviderCandidate,
  capabilities: readonly string[],
  input: RouteInput
): JsonValue {
  const assignments = assignCapabilities(
    [candidate],
    capabilities,
    input.catalog.getCapabilityCatalog(),
    input.request
  ).map((assignment) => ({
    capabilityId: assignment.capabilityId,
    domain: assignment.domain,
    scope: assignment.scope,
    property: assignment.property,
    exclusive: assignment.exclusive
  }));
  const selectedIds = new Set(selectedIntegrationIds(candidate, capabilities));
  const integrations = candidate.manifest.integrations
    .filter((integration) => selectedIds.has(integration.id))
    .map((integration) => ({
      kind: integration.kind,
      mode: integration.mode,
      status: integration.status,
      version: integration.version,
      protocol: integration.protocol ?? null,
      authorization: integration.authorization,
      executionRisk: integration.executionRisk,
      dataExposure: integration.dataExposure,
      permissions: integration.permissions,
      licenseExpression: integration.licenseExpression ?? null,
      packageName: integration.packageName ?? null,
      importPaths: integration.importPaths ?? null,
      command: integration.command ?? null
    }))
    .sort((left, right) =>
      canonicalJson(json(left)).localeCompare(canonicalJson(json(right)))
    );
  const claims = capabilities
    .map((capability) => candidate.claims.get(capability))
    .filter(
      (claim): claim is NonNullable<typeof claim> => claim !== undefined
    )
    .map((claim) => ({
      capability: claim.capability,
      support: claim.support,
      confidence: claim.confidence,
      conditions: [...claim.conditions].sort(),
      limitations: [...claim.limitations].sort()
    }))
    .sort((left, right) => left.capability.localeCompare(right.capability));
  return json({
    assignments,
    claims,
    integrations,
    verification: {
      requiredChecks: [...candidate.manifest.verification.requiredChecks].sort(),
      hardGates: [...candidate.manifest.verification.hardGates].sort()
    }
  });
}

function behaviorSignature(
  providerSet: readonly ProviderCandidate[],
  assignments: ReturnType<typeof assignCapabilities>,
  input: RouteInput
): string {
  const behaviors = providerSet
    .map((provider) => {
      const capabilities = assignments
        .filter((assignment) => assignment.providerId === provider.providerId)
        .map((assignment) => assignment.capabilityId)
        .sort();
      return providerBehavior(provider, capabilities, input);
    })
    .sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right))
    );
  return canonicalJson(json(behaviors));
}

function equivalentWinner(
  tied: readonly RankedValidSet[],
  input: RouteInput
): RankedValidSet | null {
  const signatures = new Set(
    tied.map((candidate) =>
      behaviorSignature(candidate.providerSet, candidate.assignments, input)
    )
  );
  if (signatures.size !== 1) return null;
  return [...tied].sort((left, right) =>
    left.providerSet
      .map((provider) => provider.providerId)
      .join("\u0000")
      .localeCompare(
        right.providerSet.map((provider) => provider.providerId).join("\u0000")
      )
  )[0] ?? null;
}

function finalize(
  initial: RoutePlan,
  input: RouteInput,
  payload: Pick<
    RoutePlan,
    | "status"
    | "selectedProviders"
    | "rejectedProviders"
    | "ownership"
    | "constraints"
    | "uncertainty"
    | "requiredInput"
  >
): RoutePlan {
  const stablePayload = {
    schemaVersion: initial.schemaVersion,
    contractKind: initial.contractKind,
    status: payload.status,
    requestId: initial.requestId,
    projectSnapshotId: initial.projectSnapshotId,
    catalogSnapshotId: initial.catalogSnapshotId,
    policySnapshotId: initial.policySnapshotId,
    requestedCapabilities: requestedCapabilities(input),
    selectedProviders: payload.selectedProviders,
    rejectedProviders: payload.rejectedProviders,
    ownership: payload.ownership,
    constraints: payload.constraints,
    uncertainty: payload.uncertainty,
    requiredInput: [...payload.requiredInput].sort()
  };
  const digest = digestJson(json(stablePayload));
  const plan: RoutePlan = {
    ...stablePayload,
    planId: `route_${digest.slice("sha256:".length, "sha256:".length + 24)}`,
    createdAt: initial.createdAt,
    digest
  };
  assertContract<RoutePlan>("route-plan", plan);
  return plan;
}

function resolveOwnershipFallback(
  initial: RoutePlan,
  input: RouteInput
): RoutePlan {
  const ranked = rankedValidSets(input);
  const best = ranked.sets[0];
  if (best === undefined) return initial;

  const tied = ranked.sets.filter((candidate) =>
    equalScores(candidate.score, best.score)
  );
  if (tied.length > 1) {
    const equivalent = equivalentWinner(tied, input);
    if (equivalent === null) {
      const tiedProviders = tied.flatMap((candidate) =>
        candidate.providerSet.map((provider) => ({
          providerId: provider.providerId,
          reasonCode: "MATERIAL_TIE" as const,
          reason: `Provider "${provider.providerId}" participates in a materially different tied route.`
        }))
      );
      return finalize(initial, input, {
        status: "needs-input",
        selectedProviders: [],
        rejectedProviders: stableRejections([
          ...ranked.collection.rejections,
          ...tiedProviders
        ]),
        ownership: [],
        constraints: [
          {
            code: "PROJECT_SNAPSHOT_MATCH",
            status: "passed",
            message: "The Route Request references the supplied Project Snapshot."
          },
          {
            code: "MATERIAL_TIE",
            status: "failed",
            message: "Materially different ownership-valid provider architectures remain tied."
          }
        ],
        uncertainty: 1,
        requiredInput: ["preferred provider"]
      });
    }
    return resolveSelected(initial, input, ranked, equivalent);
  }

  return resolveSelected(initial, input, ranked, best);
}

function resolveSelected(
  initial: RoutePlan,
  input: RouteInput,
  ranked: ReturnType<typeof rankedValidSets>,
  selected: RankedValidSet
): RoutePlan {
  const selectedIds = new Set(
    selected.providerSet.map((provider) => provider.providerId)
  );
  const alternativeRejections = ranked.collection.candidates
    .filter(
      (candidate) =>
        candidate.providerId !== "web-platform" &&
        !selectedIds.has(candidate.providerId)
    )
    .map((candidate) => ({
      providerId: candidate.providerId,
      reasonCode: "ALTERNATIVE_NOT_NEEDED" as const,
      reason: `Provider "${candidate.providerId}" is not needed by the highest-ranked ownership-valid route.`
    }));
  return finalize(initial, input, {
    status: "selected",
    selectedProviders: selectedProviders(
      selected.providerSet,
      selected.assignments
    ),
    rejectedProviders: stableRejections([
      ...ranked.collection.rejections,
      ...alternativeRejections
    ]),
    ownership: buildOwnershipPlan(selected.assignments),
    constraints: [
      {
        code: "PROJECT_SNAPSHOT_MATCH",
        status: "passed",
        message: "The Route Request references the supplied Project Snapshot."
      },
      {
        code: "CAPABILITY_MATCH",
        status: "passed",
        message: "Every required capability is covered by a healthy policy-approved provider."
      },
      {
        code: "PROVIDER_LIMIT_EXCEEDED",
        status: "passed",
        message: `Selected ${selected.providerSet.length} provider(s) within maxProviders ${input.request.preferences.maxProviders}.`
      },
      {
        code: "MINIMAL_PROVIDER_SET",
        status: "passed",
        message: "The selected provider set is the highest-ranked ownership-valid sufficient set."
      },
      {
        code: "OWNERSHIP_CONFLICT",
        status: "passed",
        message: "Selected providers have no exclusive same-scope/property conflict."
      }
    ],
    uncertainty: 0,
    requiredInput: []
  });
}

export function routeCapabilities(input: RouteInput): RoutePlan {
  const initial = routeCapabilitiesBase(input);
  const blockedByOwnership =
    initial.status === "blocked" &&
    initial.constraints.some(
      (constraint) =>
        constraint.code === "OWNERSHIP_CONFLICT" &&
        constraint.status === "failed"
    );
  return blockedByOwnership
    ? resolveOwnershipFallback(initial, input)
    : initial;
}
