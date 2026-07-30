import {
  assertContract,
  canonicalJson,
  digestJson,
  type JsonValue,
  type RoutePlan,
  type RouteRequest
} from "@soren-sdk/contracts";

import { collectProviderCandidates } from "./candidates.js";
import { assignCapabilities } from "./ownership.js";
import {
  getPhase4CompanionIntegrationIds,
  getRequiredCompanionIntegrationIds,
  PHASE_4_POLICY
} from "./policy.js";
import { routeCapabilities as routeCapabilitiesBase } from "./route-capabilities.js";
import type { ProviderCandidate, RouteInput } from "./types.js";

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

function requiredSdkCapabilities(input: RouteInput): string[] {
  const catalog = input.catalog.getCapabilityCatalog();
  const native = new Set(
    catalog.capabilities
      .filter((capability) => capability.native)
      .map((capability) => capability.id)
  );
  return [
    ...new Set(
      input.request.capabilities
        .filter((capability) => capability.required && !native.has(capability.id))
        .map((capability) => capability.id)
    )
  ].sort();
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

function compareScore(left: ProviderSetScore, right: ProviderSetScore): number {
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

function sameScore(left: ProviderSetScore, right: ProviderSetScore): boolean {
  return compareScore(left, right) === 0;
}

function topTiedProviderSets(input: RouteInput): ProviderCandidate[][] {
  const capabilities = requiredSdkCapabilities(input);
  if (capabilities.length === 0) return [];
  const policy = input.policy ?? PHASE_4_POLICY;
  const collection = collectProviderCandidates({
    catalog: input.catalog,
    project: input.project,
    request: input.request,
    policy,
    requiredCapabilityIds: new Set(capabilities)
  });
  const providerSets = subsets(
    collection.candidates.filter(
      (candidate) => candidate.providerId !== "web-platform"
    )
  )
    .filter((providerSet) => covers(providerSet, capabilities))
    .filter(
      (providerSet) =>
        providerSet.length <= input.request.preferences.maxProviders
    )
    .map((providerSet) => ({
      providerSet,
      score: score(providerSet, capabilities)
    }))
    .sort((left, right) => {
      const result = compareScore(left.score, right.score);
      if (result !== 0) return result;
      return left.providerSet
        .map((provider) => provider.providerId)
        .join("\u0000")
        .localeCompare(
          right.providerSet.map((provider) => provider.providerId).join("\u0000")
        );
    });
  const best = providerSets[0];
  if (best === undefined) return [];
  return providerSets
    .filter((candidate) => sameScore(candidate.score, best.score))
    .map((candidate) => candidate.providerSet);
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
  const selectedIds = new Set(
    selectedIntegrationIds(candidate, capabilities)
  );
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
  return json({ assignments, claims, integrations });
}

function behaviorSignature(
  providerSet: readonly ProviderCandidate[],
  input: RouteInput
): string {
  const capabilities = requiredSdkCapabilities(input);
  const assignments = assignCapabilities(
    providerSet,
    capabilities,
    input.catalog.getCapabilityCatalog(),
    input.request
  );
  const behaviors = providerSet
    .map((provider) => {
      const assigned = assignments
        .filter((assignment) => assignment.providerId === provider.providerId)
        .map((assignment) => assignment.capabilityId)
        .sort();
      return providerBehavior(provider, assigned, input);
    })
    .sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right))
    );
  return canonicalJson(json(behaviors));
}

function equivalentWinner(input: RouteInput): string[] | null {
  const tied = topTiedProviderSets(input);
  if (tied.length < 2) return null;
  const signatures = new Set(
    tied.map((providerSet) => behaviorSignature(providerSet, input))
  );
  if (signatures.size !== 1) return null;
  return tied
    .map((providerSet) =>
      providerSet.map((provider) => provider.providerId).sort()
    )
    .sort((left, right) =>
      left.join("\u0000").localeCompare(right.join("\u0000"))
    )[0] ?? null;
}

function candidateMap(input: RouteInput): Map<string, ProviderCandidate> {
  const requiredCapabilityIds = new Set(
    input.request.capabilities
      .filter((capability) => capability.required)
      .map((capability) => capability.id)
  );
  const collection = collectProviderCandidates({
    catalog: input.catalog,
    project: input.project,
    request: input.request,
    policy: input.policy ?? PHASE_4_POLICY,
    requiredCapabilityIds
  });
  return new Map(
    collection.candidates.map((candidate) => [candidate.providerId, candidate])
  );
}

function rebuildPlan(
  plan: RoutePlan,
  input: RouteInput,
  originalPreferredProviders: readonly string[]
): RoutePlan {
  const candidates = candidateMap(input);
  const selectedProviders = plan.selectedProviders
    .map((selected) => {
      const candidate = candidates.get(selected.providerId);
      if (candidate === undefined) {
        throw new Error(
          `Selected provider "${selected.providerId}" is no longer policy-eligible during final Route Plan construction.`
        );
      }
      const injectedPreference =
        selected.reasonCode === "PREFERRED_PROVIDER" &&
        !originalPreferredProviders.includes(selected.providerId);
      return {
        ...selected,
        integrationIds: selectedIntegrationIds(
          candidate,
          selected.capabilities
        ),
        ...(injectedPreference
          ? {
              reasonCode: "CAPABILITY_MATCH",
              reason: `Provider "${selected.providerId}" is the stable-ID winner among behaviorally equivalent routes.`
            }
          : {})
      };
    })
    .sort((left, right) => left.providerId.localeCompare(right.providerId));
  const stablePayload = {
    schemaVersion: plan.schemaVersion,
    contractKind: plan.contractKind,
    status: plan.status,
    requestId: plan.requestId,
    projectSnapshotId: plan.projectSnapshotId,
    catalogSnapshotId: plan.catalogSnapshotId,
    policySnapshotId: plan.policySnapshotId,
    requestedCapabilities: [...plan.requestedCapabilities].sort(),
    selectedProviders,
    rejectedProviders: plan.rejectedProviders,
    ownership: plan.ownership,
    constraints: plan.constraints,
    uncertainty: plan.uncertainty,
    requiredInput: [...plan.requiredInput].sort()
  };
  const digest = digestJson(json(stablePayload));
  const rebuilt: RoutePlan = {
    ...stablePayload,
    planId: `route_${digest.slice("sha256:".length, "sha256:".length + 24)}`,
    createdAt: plan.createdAt,
    digest
  };
  assertContract<RoutePlan>("route-plan", rebuilt);
  return rebuilt;
}

export function routeCapabilities(input: RouteInput): RoutePlan {
  const originalPreferredProviders = [
    ...input.request.preferences.preferredProviders
  ];
  const initial = routeCapabilitiesBase(input);
  if (
    initial.status !== "needs-input" ||
    !initial.constraints.some((item) => item.code === "MATERIAL_TIE")
  ) {
    return rebuildPlan(initial, input, originalPreferredProviders);
  }

  const winner = equivalentWinner(input);
  if (winner === null) return initial;
  const preferredProviders = [
    ...winner,
    ...originalPreferredProviders.filter(
      (providerId) => !winner.includes(providerId)
    )
  ];
  const request: RouteRequest = {
    ...input.request,
    preferences: {
      ...input.request.preferences,
      preferredProviders
    }
  };
  const resolved = routeCapabilitiesBase({ ...input, request });
  return rebuildPlan(resolved, input, originalPreferredProviders);
}
