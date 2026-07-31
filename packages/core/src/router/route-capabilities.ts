import {
  canonicalJson,
  digestJson,
  validateContract,
  type JsonValue,
  type ProjectSnapshot,
  type RoutePlan,
  type RouteRequest
} from "@soren-sdk/contracts";

import {
  buildProviderCandidates,
  type CandidateBuildResult,
  type ProviderCandidate
} from "./candidates.js";
import {
  buildRejectedProviders,
  buildSelectedProviders
} from "./explain.js";
import {
  resolveOwnership,
  type CapabilityAssignment,
  type OwnershipResolution
} from "./ownership.js";
import { getPhase4Policy } from "./policy.js";
import {
  compareRouteCandidates,
  isMaterialArchitecturalTie,
  rankRouteCandidate,
  type RankedRoute
} from "./rank.js";
import {
  RouteInputError,
  type ActiveRoutingPolicy,
  type RouteInput
} from "./types.js";

interface NormalizedCapability {
  id: string;
  required: boolean;
  quality?: Record<string, boolean | number | string>;
}

interface CapabilityOption {
  assignment: CapabilityAssignment;
}

interface RouteCombination {
  assignments: CapabilityAssignment[];
  omitted: string[];
}

interface EvaluatedRoute {
  assignments: CapabilityAssignment[];
  omitted: string[];
  ownership: OwnershipResolution;
  ranked: RankedRoute;
}

interface PlanState {
  status: RoutePlan["status"];
  assignments: CapabilityAssignment[];
  ownership: RoutePlan["ownership"];
  constraints: RoutePlan["constraints"];
  requiredInput: string[];
  omitted: string[];
  rejectedOverrides?: RoutePlan["rejectedProviders"];
}

function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function validationMessage(
  issues: readonly {
    instancePath: string;
    keyword: string;
    message: string;
  }[]
): string {
  return issues
    .map(
      (issue) =>
        `${issue.instancePath || "/"} ${issue.keyword}: ${issue.message}`
    )
    .join("; ");
}

function validateInput<T>(
  name: "project-snapshot" | "route-request",
  value: unknown
): T {
  const result = validateContract<T>(name, value);
  if (!result.ok) {
    throw new RouteInputError(
      "ROUTE_INPUT_INVALID",
      `${name} is invalid: ${validationMessage(result.issues)}`
    );
  }
  return result.value;
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function uniqueInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function normalizeQuality(
  quality: RouteRequest["capabilities"][number]["quality"]
): Record<string, boolean | number | string> | undefined {
  if (quality === undefined) return undefined;
  const entries = Object.entries(quality).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function normalizeRequest(request: RouteRequest): RouteRequest {
  const byId = new Map<string, NormalizedCapability>();
  for (const capability of request.capabilities) {
    const normalized: NormalizedCapability = {
      id: capability.id,
      required: capability.required,
      ...(normalizeQuality(capability.quality) === undefined
        ? {}
        : { quality: normalizeQuality(capability.quality) })
    };
    const existing = byId.get(capability.id);
    if (existing !== undefined) {
      if (
        canonicalJson(asJsonValue(existing)) !==
        canonicalJson(asJsonValue(normalized))
      ) {
        throw new RouteInputError(
          "ROUTE_INPUT_INVALID",
          `Capability ${capability.id} is duplicated with contradictory requirements or quality data.`
        );
      }
      continue;
    }
    byId.set(capability.id, normalized);
  }

  return {
    ...request,
    capabilities: [...byId.values()].sort((left, right) =>
      [left.id, canonicalJson(asJsonValue(left.quality ?? {}))]
        .join("\0")
        .localeCompare(
          [right.id, canonicalJson(asJsonValue(right.quality ?? {}))].join(
            "\0"
          )
        )
    ),
    preferences: {
      ...request.preferences,
      preferredProviders: uniqueInOrder(
        request.preferences.preferredProviders
      ),
      forbiddenProviders: stableUnique(
        request.preferences.forbiddenProviders
      )
    }
  };
}

function preferredRank(
  request: RouteRequest,
  providerId: string
): number | null {
  const index = request.preferences.preferredProviders.indexOf(providerId);
  return index === -1 ? null : index;
}

function assignmentOptions(
  capability: NormalizedCapability,
  request: RouteRequest,
  candidates: ProviderCandidate[]
): {
  supported: CapabilityOption[];
  environmentFailures: Array<{ providerId: string; reason: string }>;
} {
  const supported: CapabilityOption[] = [];
  const environmentFailures: Array<{ providerId: string; reason: string }> = [];

  for (const candidate of candidates) {
    for (const claim of candidate.claims) {
      if (claim.capabilityId !== capability.id) continue;
      if (!claim.environmentSupported) {
        environmentFailures.push({
          providerId: candidate.providerId,
          reason:
            claim.environmentReason ??
            `${candidate.providerId} does not support the current environment.`
        });
        continue;
      }
      supported.push({
        assignment: {
          capabilityId: capability.id,
          providerId: candidate.providerId,
          native: candidate.native,
          integrationIds: [...candidate.runtimeIntegrationIds],
          support: claim.support,
          confidence: claim.confidence,
          installed: candidate.installed,
          preferredRank: preferredRank(request, candidate.providerId)
        }
      });
    }
  }

  const supportRank = { primary: 0, secondary: 1, fallback: 2 } as const;
  supported.sort((left, right) =>
    [
      String(supportRank[left.assignment.support]),
      String(-left.assignment.confidence),
      left.assignment.providerId
    ]
      .join("\0")
      .localeCompare(
        [
          String(supportRank[right.assignment.support]),
          String(-right.assignment.confidence),
          right.assignment.providerId
        ].join("\0")
      )
  );
  environmentFailures.sort((left, right) =>
    [left.providerId, left.reason]
      .join("\0")
      .localeCompare([right.providerId, right.reason].join("\0"))
  );
  return { supported, environmentFailures };
}

function rejectionForCapability(
  capabilityId: string,
  candidateBuild: CandidateBuildResult,
  input: RouteInput
): RoutePlan["rejectedProviders"][number] | undefined {
  for (const rejection of candidateBuild.rejections) {
    const record = input.catalog.get(rejection.providerId);
    if (
      record?.kind === "schema-v2" &&
      record.manifest.capabilityClaims.some(
        (claim) => claim.capability === capabilityId
      )
    ) {
      return {
        providerId: rejection.providerId,
        reasonCode: rejection.reasonCode,
        reason: rejection.reason
      };
    }
  }
  return undefined;
}

function assignmentConstraints(
  assignments: CapabilityAssignment[]
): RoutePlan["constraints"] {
  return assignments
    .map((assignment) => ({
      code: assignment.native
        ? "NATIVE_CAPABILITY_MATCH"
        : "CAPABILITY_MATCH",
      status: "passed" as const,
      message: `${assignment.providerId} covers ${assignment.capabilityId}.`
    }))
    .sort((left, right) =>
      [left.code, left.message]
        .join("\0")
        .localeCompare([right.code, right.message].join("\0"))
    );
}

function mergeRejectedProviders(
  base: RoutePlan["rejectedProviders"],
  overrides: RoutePlan["rejectedProviders"] = []
): RoutePlan["rejectedProviders"] {
  const values = new Map<string, RoutePlan["rejectedProviders"][number]>();
  for (const item of base) values.set(item.providerId, item);
  for (const item of overrides) values.set(item.providerId, item);
  return [...values.values()].sort((left, right) =>
    [left.providerId, left.reasonCode, left.reason]
      .join("\0")
      .localeCompare(
        [right.providerId, right.reasonCode, right.reason].join("\0")
      )
  );
}

function buildPlan(input: {
  routeInput: RouteInput;
  request: RouteRequest;
  project: ProjectSnapshot;
  policy: ActiveRoutingPolicy;
  candidateBuild: CandidateBuildResult;
  state: PlanState;
}): RoutePlan {
  const requestedCapabilityIds = input.request.capabilities.map(
    (capability) => capability.id
  );
  const canSelect = ["native", "selected"].includes(input.state.status);
  const explanationAssignments = canSelect ? input.state.assignments : [];
  const selectedProviders =
    input.state.status === "selected"
      ? buildSelectedProviders(
          explanationAssignments,
          input.candidateBuild.candidates
        )
      : [];
  const rejectedProviders = mergeRejectedProviders(
    buildRejectedProviders({
      assignments: explanationAssignments,
      candidates: input.candidateBuild.candidates,
      rejections: input.candidateBuild.rejections,
      requestedCapabilityIds
    }),
    input.state.rejectedOverrides
  );
  const constraints = [
    ...input.state.constraints,
    ...input.state.omitted.map((capabilityId) => ({
      code: "OPTIONAL_CAPABILITY_OMITTED",
      status: "not-applicable" as const,
      message: `Optional capability ${capabilityId} was omitted.`
    }))
  ].sort((left, right) =>
    [left.code, left.status, left.message]
      .join("\0")
      .localeCompare(
        [right.code, right.status, right.message].join("\0")
      )
  );
  const requiredInput = stableUnique(input.state.requiredInput);
  const uncertainty = input.state.status === "needs-input" ? 1 : 0;
  const decisionPayload = {
    requestedCapabilities: input.request.capabilities,
    preferences: input.request.preferences,
    projectSnapshotId: input.project.snapshotId,
    catalogSnapshotId: input.candidateBuild.catalogSnapshot.snapshotId,
    policySnapshotId: input.policy.snapshotId,
    status: input.state.status,
    selectedProviders,
    rejectedProviders,
    ownership: input.state.ownership,
    constraints,
    uncertainty,
    requiredInput
  };
  const digest = digestJson(asJsonValue(decisionPayload));
  const plan: RoutePlan = {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "route-plan",
    planId: `route_${digest.slice("sha256:".length, "sha256:".length + 24)}`,
    createdAt: input.routeInput.createdAt ?? new Date().toISOString(),
    status: input.state.status,
    requestId: input.request.requestId,
    projectSnapshotId: input.project.snapshotId,
    catalogSnapshotId: input.candidateBuild.catalogSnapshot.snapshotId,
    policySnapshotId: input.policy.snapshotId,
    requestedCapabilities: stableUnique(requestedCapabilityIds),
    selectedProviders,
    rejectedProviders,
    ownership: input.state.ownership,
    constraints,
    uncertainty,
    requiredInput,
    digest
  };

  const validation = validateContract<RoutePlan>("route-plan", plan);
  if (!validation.ok) {
    throw new RouteInputError(
      "ROUTE_PLAN_INVALID",
      validationMessage(validation.issues)
    );
  }
  return validation.value;
}

function evaluatedRoute(
  request: RouteRequest,
  combination: RouteCombination
): EvaluatedRoute {
  const ownership = resolveOwnership({
    request,
    assignments: combination.assignments
  });
  const selectedProviderIds = stableUnique(
    combination.assignments
      .filter((assignment) => !assignment.native)
      .map((assignment) => assignment.providerId)
  );
  return {
    assignments: combination.assignments,
    omitted: combination.omitted,
    ownership,
    ranked: rankRouteCandidate({
      assignments: combination.assignments,
      selectedProviderIds
    })
  };
}

function deduplicateRoutes(routes: EvaluatedRoute[]): EvaluatedRoute[] {
  const values = new Map<string, EvaluatedRoute>();
  for (const route of routes) {
    const key = `${route.ranked.architectureSignature}|${route.omitted
      .slice()
      .sort()
      .join(",")}`;
    if (!values.has(key)) values.set(key, route);
  }
  return [...values.values()];
}

export function routeCapabilities(input: RouteInput): RoutePlan {
  const request = normalizeRequest(
    validateInput<RouteRequest>("route-request", input.request)
  );
  const project = validateInput<ProjectSnapshot>(
    "project-snapshot",
    input.project
  );
  if (request.projectSnapshotId !== project.snapshotId) {
    throw new RouteInputError(
      "ROUTE_INPUT_INVALID",
      "Route request projectSnapshotId does not match the supplied project snapshot."
    );
  }

  const policy = getPhase4Policy(input.policy);
  const candidateBuild = buildProviderCandidates({
    request,
    project,
    catalog: input.catalog,
    policy
  });
  const knownCapabilities = new Set(
    candidateBuild.capabilityCatalog.capabilities.map((capability) => capability.id)
  );
  let combinations: RouteCombination[] = [{ assignments: [], omitted: [] }];

  for (const capability of request.capabilities) {
    if (!knownCapabilities.has(capability.id)) {
      if (capability.required) {
        return buildPlan({
          routeInput: input,
          request,
          project,
          policy,
          candidateBuild,
          state: {
            status: "blocked",
            assignments: [],
            ownership: [],
            constraints: [
              {
                code: "CAPABILITY_NOT_SUPPORTED",
                status: "failed",
                message: `Required capability ${capability.id} is unknown.`
              }
            ],
            requiredInput: [],
            omitted: []
          }
        });
      }
      combinations = combinations.map((combination) => ({
        ...combination,
        omitted: [...combination.omitted, capability.id]
      }));
      continue;
    }

    const options = assignmentOptions(
      capability,
      request,
      candidateBuild.candidates
    );
    if (capability.required && options.supported.length === 0) {
      const environment = options.environmentFailures[0];
      const rejection = rejectionForCapability(
        capability.id,
        candidateBuild,
        input
      );
      const code =
        environment !== undefined
          ? "ENVIRONMENT_UNSUPPORTED"
          : rejection?.reasonCode ?? "CAPABILITY_NOT_SUPPORTED";
      const message =
        environment?.reason ??
        rejection?.reason ??
        `No eligible provider covers required capability ${capability.id}.`;
      return buildPlan({
        routeInput: input,
        request,
        project,
        policy,
        candidateBuild,
        state: {
          status: "blocked",
          assignments: [],
          ownership: [],
          constraints: [{ code, status: "failed", message }],
          requiredInput: [],
          omitted: [],
          ...(rejection === undefined
            ? environment === undefined
              ? {}
              : {
                  rejectedOverrides: [
                    {
                      providerId: environment.providerId,
                      reasonCode: "ENVIRONMENT_UNSUPPORTED",
                      reason: environment.reason
                    }
                  ]
                }
            : { rejectedOverrides: [rejection] })
        }
      });
    }

    const next: RouteCombination[] = [];
    for (const combination of combinations) {
      if (!capability.required) {
        next.push({
          assignments: [...combination.assignments],
          omitted: [...combination.omitted, capability.id]
        });
      }
      for (const option of options.supported) {
        next.push({
          assignments: [...combination.assignments, option.assignment],
          omitted: [...combination.omitted]
        });
      }
    }
    combinations = next;
  }

  const valid: EvaluatedRoute[] = [];
  const ambiguous: EvaluatedRoute[] = [];
  const ownershipBlocked: EvaluatedRoute[] = [];
  let providerLimitExceeded = false;

  for (const combination of combinations) {
    const selectedProviderCount = new Set(
      combination.assignments
        .filter((assignment) => !assignment.native)
        .map((assignment) => assignment.providerId)
    ).size;
    if (selectedProviderCount > request.preferences.maxProviders) {
      providerLimitExceeded = true;
      continue;
    }
    const route = evaluatedRoute(request, combination);
    if (route.ownership.status === "blocked") {
      ownershipBlocked.push(route);
    } else if (route.ownership.status === "needs-input") {
      ambiguous.push(route);
    } else {
      valid.push(route);
    }
  }

  const sortedValid = deduplicateRoutes(valid).sort((left, right) => {
    const comparison = compareRouteCandidates(left.ranked, right.ranked);
    return comparison !== 0
      ? comparison
      : left.ranked.architectureSignature.localeCompare(
          right.ranked.architectureSignature
        );
  });

  const best = sortedValid[0];
  const second = sortedValid[1];
  if (best !== undefined) {
    if (
      second !== undefined &&
      isMaterialArchitecturalTie(best.ranked, second.ranked)
    ) {
      const providers = stableUnique([
        ...best.ranked.selectedProviderIds,
        ...second.ranked.selectedProviderIds
      ]);
      return buildPlan({
        routeInput: input,
        request,
        project,
        policy,
        candidateBuild,
        state: {
          status: "needs-input",
          assignments: [],
          ownership: [],
          constraints: [
            {
              code: "MATERIAL_TIE",
              status: "failed",
              message: "Equally ranked routes imply different provider architectures."
            }
          ],
          requiredInput: [
            `Choose the provider architecture: ${providers.join(" or ")}.`
          ],
          omitted: stableUnique([...best.omitted, ...second.omitted])
        }
      });
    }

    const selectedProviderIds = best.ranked.selectedProviderIds;
    const status: RoutePlan["status"] =
      best.assignments.length === 0
        ? "no-sdk"
        : selectedProviderIds.length === 0
          ? "native"
          : "selected";
    const constraints = [
      ...assignmentConstraints(best.assignments),
      ...(status === "selected"
        ? [
            {
              code: "MINIMAL_PROVIDER_SET",
              status: "passed" as const,
              message: `Selected the minimal provider set: ${selectedProviderIds.join(", ")}.`
            }
          ]
        : [])
    ];
    return buildPlan({
      routeInput: input,
      request,
      project,
      policy,
      candidateBuild,
      state: {
        status,
        assignments: best.assignments,
        ownership: best.ownership.ownership,
        constraints,
        requiredInput: [],
        omitted: best.omitted
      }
    });
  }

  const bestAmbiguous = deduplicateRoutes(ambiguous).sort((left, right) =>
    compareRouteCandidates(left.ranked, right.ranked)
  )[0];
  if (bestAmbiguous !== undefined) {
    return buildPlan({
      routeInput: input,
      request,
      project,
      policy,
      candidateBuild,
      state: {
        status: "needs-input",
        assignments: [],
        ownership: bestAmbiguous.ownership.ownership,
        constraints: [
          ...assignmentConstraints(bestAmbiguous.assignments),
          ...bestAmbiguous.ownership.constraints
        ],
        requiredInput: bestAmbiguous.ownership.requiredInput,
        omitted: bestAmbiguous.omitted
      }
    });
  }

  const blockedOwnership = ownershipBlocked[0];
  if (blockedOwnership !== undefined) {
    return buildPlan({
      routeInput: input,
      request,
      project,
      policy,
      candidateBuild,
      state: {
        status: "blocked",
        assignments: [],
        ownership: blockedOwnership.ownership.ownership,
        constraints: [
          ...assignmentConstraints(blockedOwnership.assignments),
          ...blockedOwnership.ownership.constraints
        ],
        requiredInput: [],
        omitted: blockedOwnership.omitted
      }
    });
  }

  return buildPlan({
    routeInput: input,
    request,
    project,
    policy,
    candidateBuild,
    state: {
      status: "blocked",
      assignments: [],
      ownership: [],
      constraints: [
        providerLimitExceeded
          ? {
              code: "PROVIDER_LIMIT_EXCEEDED",
              status: "failed",
              message: `No sufficient route fits maxProviders=${request.preferences.maxProviders}.`
            }
          : {
              code: "CAPABILITY_NOT_SUPPORTED",
              status: "failed",
              message: "No eligible provider set covers the required capabilities."
            }
      ],
      requiredInput: [],
      omitted: []
    }
  });
}
