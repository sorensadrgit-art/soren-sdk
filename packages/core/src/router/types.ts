import type {
  ConnectorManifest,
  PolicyDocument,
  ProjectSnapshot,
  RoutePlan,
  RouteRequest
} from "@soren-sdk/contracts";

import type { CatalogReader } from "../catalog/types.js";

export const ROUTE_REASON_CODES = [
  "NATIVE_CAPABILITY_MATCH",
  "CAPABILITY_MATCH",
  "EXISTING_DEPENDENCY_REUSE",
  "PREFERRED_PROVIDER",
  "MINIMAL_PROVIDER_SET",
  "FORBIDDEN_PROVIDER",
  "POLICY_DENIED",
  "CONNECTOR_UNHEALTHY",
  "CAPABILITY_NOT_SUPPORTED",
  "ENVIRONMENT_UNSUPPORTED",
  "PROVIDER_LIMIT_EXCEEDED",
  "OWNERSHIP_CONFLICT",
  "ALTERNATIVE_NOT_NEEDED",
  "MATERIAL_TIE"
] as const;

export type RouteReasonCode = (typeof ROUTE_REASON_CODES)[number];

export interface RouteInput {
  request: RouteRequest;
  project: ProjectSnapshot;
  catalog: CatalogReader;
  policy?: PolicyDocument;
  createdAt?: string;
}

export interface ProviderRejection {
  providerId: string;
  reasonCode: RouteReasonCode;
  reason: string;
}

export interface ProviderCandidate {
  providerId: string;
  manifest: ConnectorManifest;
  integrationIds: string[];
  claims: Map<string, ConnectorManifest["capabilityClaims"][number]>;
  dependencyReuse: boolean;
  preferredRank: number | null;
}

export interface CapabilityAssignment {
  capabilityId: string;
  providerId: string;
  domain: string;
  scope: string;
  property: string;
  exclusive: boolean;
}

export interface RouteResolution {
  status: RoutePlan["status"];
  selectedProviders: RoutePlan["selectedProviders"];
  rejectedProviders: RoutePlan["rejectedProviders"];
  ownership: RoutePlan["ownership"];
  constraints: RoutePlan["constraints"];
  uncertainty: number;
  requiredInput: string[];
}
