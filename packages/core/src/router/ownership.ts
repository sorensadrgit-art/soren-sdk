import type {
  Capability,
  CapabilityCatalog,
  OwnershipClaim,
  RoutePlan,
  RouteRequest
} from "@soren-sdk/contracts";

import type {
  CapabilityAssignment,
  ProviderCandidate
} from "./types.js";

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

function compareProvidersForCapability(
  capabilityId: string,
  left: ProviderCandidate,
  right: ProviderCandidate
): number {
  const leftClaim = left.claims.get(capabilityId);
  const rightClaim = right.claims.get(capabilityId);
  if (leftClaim === undefined) return 1;
  if (rightClaim === undefined) return -1;

  const supportDifference =
    supportRank(rightClaim.support) - supportRank(leftClaim.support);
  if (supportDifference !== 0) return supportDifference;
  if (rightClaim.confidence !== leftClaim.confidence) {
    return rightClaim.confidence - leftClaim.confidence;
  }
  if (left.dependencyReuse !== right.dependencyReuse) {
    return left.dependencyReuse ? -1 : 1;
  }
  const leftRank = left.preferredRank ?? Number.MAX_SAFE_INTEGER;
  const rightRank = right.preferredRank ?? Number.MAX_SAFE_INTEGER;
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.providerId.localeCompare(right.providerId);
}

function requestedQuality(
  request: RouteRequest,
  capabilityId: string
): Record<string, boolean | number | string> {
  return (
    request.capabilities.find((item) => item.id === capabilityId)?.quality ?? {}
  );
}

function stringQuality(
  quality: Record<string, boolean | number | string>,
  key: string
): string | null {
  const value = quality[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function capabilityById(
  catalog: CapabilityCatalog,
  capabilityId: string
): Capability {
  const capability = catalog.capabilities.find((item) => item.id === capabilityId);
  if (capability === undefined) {
    throw new Error(`Unknown capability "${capabilityId}" during ownership planning.`);
  }
  return capability;
}

function claimOwnsProperty(claim: OwnershipClaim, property: string): boolean {
  return (
    claim.properties === undefined ||
    claim.properties.length === 0 ||
    claim.properties.includes(property)
  );
}

export function assignCapabilities(
  providerSet: readonly ProviderCandidate[],
  capabilityIds: readonly string[],
  catalog: CapabilityCatalog,
  request: RouteRequest
): CapabilityAssignment[] {
  const assignments: CapabilityAssignment[] = [];

  for (const capabilityId of [...new Set(capabilityIds)].sort()) {
    const provider = providerSet
      .filter((candidate) => candidate.claims.has(capabilityId))
      .sort((left, right) =>
        compareProvidersForCapability(capabilityId, left, right)
      )[0];
    if (provider === undefined) {
      throw new Error(`No selected provider covers "${capabilityId}".`);
    }

    const capability = capabilityById(catalog, capabilityId);
    const quality = requestedQuality(request, capabilityId);
    const scope =
      stringQuality(quality, "scope") ?? `capability:${capabilityId}`;
    const property =
      stringQuality(quality, "property") ?? capability.ownershipDomain;
    const exclusive = provider.manifest.ownershipClaims.some(
      (claim) =>
        claim.domain === capability.ownershipDomain &&
        claim.exclusive &&
        claimOwnsProperty(claim, property)
    );

    assignments.push({
      capabilityId,
      providerId: provider.providerId,
      domain: capability.ownershipDomain,
      scope,
      property,
      exclusive
    });
  }

  return assignments.sort((left, right) =>
    [left.scope, left.property, left.providerId, left.capabilityId]
      .join("\u0000")
      .localeCompare(
        [right.scope, right.property, right.providerId, right.capabilityId].join(
          "\u0000"
        )
      )
  );
}

export function findOwnershipConflict(
  assignments: readonly CapabilityAssignment[]
): [CapabilityAssignment, CapabilityAssignment] | null {
  for (let leftIndex = 0; leftIndex < assignments.length; leftIndex += 1) {
    const left = assignments[leftIndex];
    if (left === undefined || !left.exclusive) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < assignments.length;
      rightIndex += 1
    ) {
      const right = assignments[rightIndex];
      if (right === undefined || !right.exclusive) continue;
      if (
        left.providerId !== right.providerId &&
        left.scope === right.scope &&
        left.property === right.property
      ) {
        return [left, right];
      }
    }
  }
  return null;
}

export function buildOwnershipPlan(
  assignments: readonly CapabilityAssignment[]
): RoutePlan["ownership"] {
  const groups = new Map<
    string,
    {
      providerId: string;
      domain: string;
      scope: string;
      properties: Set<string>;
    }
  >();

  for (const assignment of assignments) {
    const key = [
      assignment.providerId,
      assignment.domain,
      assignment.scope
    ].join("\u0000");
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        providerId: assignment.providerId,
        domain: assignment.domain,
        scope: assignment.scope,
        properties: new Set([assignment.property])
      });
    } else {
      existing.properties.add(assignment.property);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      providerId: group.providerId,
      domain: group.domain,
      scope: group.scope,
      properties: [...group.properties].sort()
    }))
    .sort((left, right) =>
      [left.providerId, left.domain, left.scope]
        .join("\u0000")
        .localeCompare([right.providerId, right.domain, right.scope].join("\u0000"))
    );
}
