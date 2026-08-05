import type { CapabilityAssignment } from "./ownership.js";

export interface RankedRouteInput {
  assignments: CapabilityAssignment[];
  selectedProviderIds: string[];
}

export interface RankedRoute {
  assignments: CapabilityAssignment[];
  selectedProviderIds: string[];
  selectedProviderCount: number;
  nativeCoverageCount: number;
  installedSelectedProviderCount: number;
  preferredRankVector: number[];
  primaryCount: number;
  secondaryCount: number;
  fallbackCount: number;
  confidenceTotal: number;
  architectureSignature: string;
}

const UNRANKED = Number.MAX_SAFE_INTEGER;

function sortedAssignments(
  assignments: CapabilityAssignment[]
): CapabilityAssignment[] {
  return assignments
    .map((assignment) => ({
      ...assignment,
      integrationIds: [...assignment.integrationIds].sort()
    }))
    .sort((left, right) => {
      let cmp = left.capabilityId.localeCompare(right.capabilityId);
      if (cmp !== 0) return cmp;
      cmp = left.providerId.localeCompare(right.providerId);
      if (cmp !== 0) return cmp;
      cmp = left.integrationIds.join(",").localeCompare(right.integrationIds.join(","));
      if (cmp !== 0) return cmp;
      cmp = left.support.localeCompare(right.support);
      if (cmp !== 0) return cmp;
      cmp = compareNumbers(left.confidence, right.confidence);
      if (cmp !== 0) return cmp;
      cmp = compareNumbers(left.installed ? 1 : 0, right.installed ? 1 : 0);
      if (cmp !== 0) return cmp;
      return compareNumbers(left.preferredRank ?? UNRANKED, right.preferredRank ?? UNRANKED);
    });
}

function compareNumbers(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareVectors(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const result = compareNumbers(
      left[index] ?? UNRANKED,
      right[index] ?? UNRANKED
    );
    if (result !== 0) return result;
  }
  return 0;
}

export function rankRouteCandidate(input: RankedRouteInput): RankedRoute {
  const assignments = sortedAssignments(input.assignments);
  const selectedProviderIds = [...new Set(input.selectedProviderIds)].sort();
  const selectedProviders = new Set(selectedProviderIds);
  const installedProviders = new Set(
    assignments
      .filter(
        (assignment) =>
          selectedProviders.has(assignment.providerId) && assignment.installed
      )
      .map((assignment) => assignment.providerId)
  );
  const preferredRankVector = selectedProviderIds
    .map((providerId) => {
      const values = assignments
        .filter((assignment) => assignment.providerId === providerId)
        .map((assignment) => assignment.preferredRank)
        .filter((value): value is number => value !== null);
      return values.length === 0 ? UNRANKED : Math.min(...values);
    })
    .sort((left, right) => left - right);

  const architectureSignature = assignments
    .map((assignment) => `${assignment.capabilityId}:${assignment.providerId}`)
    .join("|");

  return {
    assignments,
    selectedProviderIds,
    selectedProviderCount: selectedProviderIds.length,
    nativeCoverageCount: assignments.filter((assignment) => assignment.native)
      .length,
    installedSelectedProviderCount: installedProviders.size,
    preferredRankVector,
    primaryCount: assignments.filter(
      (assignment) => assignment.support === "primary"
    ).length,
    secondaryCount: assignments.filter(
      (assignment) => assignment.support === "secondary"
    ).length,
    fallbackCount: assignments.filter(
      (assignment) => assignment.support === "fallback"
    ).length,
    confidenceTotal: assignments.reduce(
      (sum, assignment) => sum + assignment.confidence,
      0
    ),
    architectureSignature
  };
}

export function compareRouteCandidates(
  left: RankedRoute,
  right: RankedRoute
): number {
  const scalarComparisons = [
    compareNumbers(left.selectedProviderCount, right.selectedProviderCount),
    compareNumbers(-left.nativeCoverageCount, -right.nativeCoverageCount),
    compareNumbers(
      -left.installedSelectedProviderCount,
      -right.installedSelectedProviderCount
    )
  ];
  for (const result of scalarComparisons) {
    if (result !== 0) return result;
  }

  const preferred = compareVectors(
    left.preferredRankVector,
    right.preferredRankVector
  );
  if (preferred !== 0) return preferred;

  const supportComparisons = [
    compareNumbers(-left.primaryCount, -right.primaryCount),
    compareNumbers(-left.secondaryCount, -right.secondaryCount),
    compareNumbers(left.fallbackCount, right.fallbackCount),
    compareNumbers(-left.confidenceTotal, -right.confidenceTotal)
  ];
  for (const result of supportComparisons) {
    if (result !== 0) return result;
  }
  return 0;
}

export function isMaterialArchitecturalTie(
  left: RankedRoute,
  right: RankedRoute
): boolean {
  return (
    compareRouteCandidates(left, right) === 0 &&
    left.architectureSignature !== right.architectureSignature
  );
}
