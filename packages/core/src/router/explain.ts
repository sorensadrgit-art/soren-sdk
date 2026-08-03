import type { RoutePlan } from "@soren-sdk/contracts";

import type {
  CandidateRejection,
  ProviderCandidate
} from "./candidates.js";
import type { CapabilityAssignment } from "./ownership.js";

export function buildSelectedProviders(
  assignments: CapabilityAssignment[],
  candidates: ProviderCandidate[]
): RoutePlan["selectedProviders"] {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.providerId, candidate])
  );
  const providerIds = [
    ...new Set(
      assignments
        .filter((assignment) => !assignment.native)
        .map((assignment) => assignment.providerId)
    )
  ].sort();

  return providerIds.map((providerId) => {
    const providerAssignments = assignments.filter(
      (assignment) => assignment.providerId === providerId
    );
    const candidate = candidateById.get(
      providerId as ProviderCandidate["providerId"]
    );
    const preferred = providerAssignments
      .map((assignment) => assignment.preferredRank)
      .some((rank) => rank !== null);
    const reasonCode = candidate?.installed
      ? "EXISTING_DEPENDENCY_REUSE"
      : preferred
        ? "PREFERRED_PROVIDER"
        : "CAPABILITY_MATCH";
    const reason = candidate?.installed
      ? `${providerId} is already declared and satisfies the requested capabilities.`
      : preferred
        ? `${providerId} is explicitly preferred and satisfies the requested capabilities.`
        : `${providerId} satisfies the requested capabilities within the minimal provider set.`;

    return {
      providerId,
      integrationIds: [
        ...new Set(
          providerAssignments.flatMap((assignment) => assignment.integrationIds)
        )
      ].sort(),
      capabilities: [
        ...new Set(
          providerAssignments.map((assignment) => assignment.capabilityId)
        )
      ].sort(),
      reasonCode,
      reason
    };
  });
}

export function buildRejectedProviders(input: {
  assignments: CapabilityAssignment[];
  candidates: ProviderCandidate[];
  rejections: CandidateRejection[];
  requestedCapabilityIds: string[];
}): RoutePlan["rejectedProviders"] {
  const selected = new Set(
    input.assignments.map((assignment) => assignment.providerId)
  );
  const values = new Map<string, RoutePlan["rejectedProviders"][number]>();

  for (const rejection of input.rejections) {
    values.set(rejection.providerId, {
      providerId: rejection.providerId,
      reasonCode: rejection.reasonCode,
      reason: rejection.reason
    });
  }

  for (const candidate of input.candidates) {
    if (selected.has(candidate.providerId) || values.has(candidate.providerId)) {
      continue;
    }
    const matches = candidate.claims.some((claim) =>
      input.requestedCapabilityIds.includes(claim.capabilityId)
    );
    values.set(candidate.providerId, {
      providerId: candidate.providerId,
      reasonCode: matches
        ? "ALTERNATIVE_NOT_NEEDED"
        : "CAPABILITY_NOT_SUPPORTED",
      reason: matches
        ? `${candidate.providerId} was not required by the selected minimal route.`
        : `${candidate.providerId} does not claim a requested capability.`
    });
  }

  return [...values.values()].sort((left, right) =>
    [left.providerId, left.reasonCode, left.reason]
      .join("\0")
      .localeCompare(
        [right.providerId, right.reasonCode, right.reason].join("\0")
      )
  );
}
