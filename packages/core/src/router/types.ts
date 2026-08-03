import type {
  Digest,
  PolicyDocument,
  ProjectSnapshot,
  RoutePlan,
  RouteRequest
} from "@soren-sdk/contracts";

import type { CatalogReader } from "../catalog/types.js";

export interface RouteInput {
  request: RouteRequest;
  project: ProjectSnapshot;
  catalog: CatalogReader;
  policy?: PolicyDocument;
  createdAt?: string;
}

export interface ActiveRoutingPolicy {
  document: PolicyDocument;
  snapshotId: Digest;
}

export type RouteInputErrorCode =
  | "POLICY_INVALID"
  | "POLICY_WEAKENING_DENIED"
  | "ROUTE_INPUT_INVALID"
  | "ROUTE_PLAN_INVALID";

export class RouteInputError extends Error {
  override readonly name = "RouteInputError";

  constructor(
    readonly code: RouteInputErrorCode,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(`${code}: ${message}`);
  }
}

export interface RouteDecisionResult {
  plan: RoutePlan;
}
