import type { JsonValue } from "./json.js";
import type { VerificationState } from "./phase8.js";

export const PERSISTED_SCHEMA_VERSION = "1.0.0-draft.1" as const;
export const CONNECTOR_SCHEMA_VERSION = "2.0.0-draft.1" as const;

export type Digest = `sha256:${string}`;
export type CheckStatus = "failed" | "not-required" | "not-run" | "passed";
export type RouteStatus = "blocked" | "native" | "needs-input" | "no-sdk" | "selected";

export interface CapabilityCatalog {
  schemaVersion: "1.0.0-draft.1";
  capabilities: Capability[];
}

export interface Capability {
  id: string;
  family: string;
  description: string;
  native: boolean;
  ownershipDomain: string;
  requires?: string[];
  conflictsWith?: string[];
}

export interface ConnectorManifest {
  $schema?: string;
  schemaVersion: "2.0.0-draft.1";
  connectorVersion: string;
  connector: {
    id: string;
    name: string;
    publisher: string;
    reviewStatus:
      | "approved"
      | "blocked"
      | "deprecated"
      | "experimental"
      | "proposed"
      | "retired"
      | "stable";
    selectable: boolean;
    blockers: string[];
  };
  product: {
    canonicalName: string;
    homepage: string;
    aliases: string[];
    categories: string[];
  };
  sourceTrust: {
    sourceAuthority:
      | "community"
      | "maintainer"
      | "official"
      | "soren-approved"
      | "unknown";
    integrityLevel:
      | "attested"
      | "commit-pinned"
      | "digest-pinned"
      | "signed"
      | "unverified"
      | "url-recorded"
      | "version-pinned";
    reviewedAt: string;
    reviewer: string;
  };
  capabilityClaims: CapabilityClaim[];
  integrations: IntegrationArtifact[];
  ownershipClaims: OwnershipClaim[];
  verification: {
    requiredChecks: string[];
    hardGates: string[];
  };
  relatedFiles: Record<
    "compatibility" | "evaluations" | "skill" | "sources",
    {
      path: string;
      status: "missing" | "not-applicable" | "planned" | "present";
    }
  >;
  knowledge: {
    retrievedAt: string;
    staleAfterDays: number;
  };
}

export interface CapabilityClaim {
  capability: string;
  support: "fallback" | "primary" | "secondary";
  confidence: number;
  conditions: string[];
  limitations: string[];
}

export interface IntegrationArtifact {
  id: string;
  kind:
    | "agent-skill"
    | "built-in"
    | "cli"
    | "documentation"
    | "mcp-server"
    | "recipe-source"
    | "runtime-package"
    | "validator";
  mode: "knowledge" | "runtime" | "tool" | "verification";
  status: "available" | "deprecated" | "planned" | "unverified";
  source: string;
  version: {
    status: "not-applicable" | "resolved" | "unresolved";
    value?: string;
    digest?: Digest;
    commit?: string;
  };
  protocol?: {
    name: "cli" | "http" | "mcp" | "none" | "stdio";
    supportedVersions: string[];
    extensions: string[];
  };
  authorization: {
    required: boolean;
    method: "api-key" | "environment" | "none" | "oauth" | "project-config" | "unknown";
    paidPlan: boolean;
  };
  executionRisk:
    | "command-execution"
    | "network-and-command"
    | "none"
    | "privileged"
    | "project-write"
    | "read-only";
  dataExposure:
    | "local-only"
    | "none"
    | "remote-metadata"
    | "remote-project-content"
    | "remote-source";
  permissions: {
    filesystem: "none" | "project-read" | "project-write" | "scoped" | "unknown";
    network: string[];
    projectWrite: boolean;
  };
  licenseExpression?: string;
  fallback?: null | string;
  packageName?: string;
  importPaths?: Record<string, string>;
  command?: string[];
  notes?: string[];
}

export interface OwnershipClaim {
  domain: string;
  scope: string;
  exclusive: boolean;
  properties?: string[];
}

export interface ProjectSnapshot {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "project-snapshot";
  snapshotId: Digest;
  createdAt: string;
  root: string;
  revision: {
    vcs: "git" | "none" | "unknown";
    commit: null | string;
    dirty: boolean;
  };
  packageManager: {
    name: "bun" | "npm" | "pnpm" | "unknown" | "yarn";
    version: null | string;
    lockfile: null | string;
    lockfileDigest: Digest | null;
  };
  workspace: {
    isMonorepo: boolean;
    packages: Array<{ name: string; path: string; private: boolean }>;
  };
  runtimes: Array<{ name: string; version: null | string }>;
  frameworks: Array<{ name: string; version: null | string; workspace: string }>;
  dependencies: Array<{
    name: string;
    version: string;
    kind: "dependency" | "devDependency" | "optionalDependency" | "peerDependency";
    workspace: string;
  }>;
  configurations: Array<{ kind: string; path: string; digest: Digest }>;
  policies: Array<{ path: string; digest: Digest }>;
  targets: { browsers: string[]; runtimes: string[] };
  warnings: string[];
}

export interface CatalogSnapshot {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "catalog-snapshot";
  snapshotId: Digest;
  createdAt: string;
  capabilityCatalogDigest: Digest;
  connectors: Array<{
    id: string;
    connectorVersion: string;
    digest: Digest;
    reviewStatus: ConnectorManifest["connector"]["reviewStatus"];
    selectable: boolean;
  }>;
}

export interface PolicyDocument {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "policy";
  policyId: string;
  version: string;
  scope: "builtin" | "organization" | "project" | "run" | "workspace";
  rules: {
    allowedConnectors: string[];
    deniedConnectors: string[];
    allowExperimental: boolean;
    allowedLicenses: string[];
    allowPaidServices: boolean;
    network: {
      mode: "allowlist" | "deny" | "unrestricted";
      allowedHosts: string[];
    };
    filesystem: {
      read: string[];
      write: string[];
    };
    allowRemoteProjectContent: boolean;
    maxBundleKilobytes?: null | number;
    requireReducedMotion: boolean;
    requiredApprovals: Array<
      "command-execution" | "network" | "project-write" | "release" | "remote-project-content"
    >;
  };
}

export interface SorenConfig {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "soren-config";
  configId: string;
  preferences?: {
    preferredProviders?: string[];
    forbiddenProviders?: string[];
    maxProviders?: number;
  };
}

export interface RouteRequest {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "route-request";
  requestId: string;
  createdAt: string;
  projectSnapshotId: Digest;
  summary: string;
  requestTextDigest?: Digest;
  capabilities: Array<{
    id: string;
    required: boolean;
    quality?: Record<string, boolean | number | string>;
  }>;
  preferences: {
    preferredProviders: string[];
    forbiddenProviders: string[];
    maxProviders: number;
    allowPaidServices: boolean;
    allowExperimental: boolean;
  };
}

export interface RoutePlan {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "route-plan";
  planId: string;
  createdAt: string;
  status: RouteStatus;
  requestId: string;
  projectSnapshotId: Digest;
  catalogSnapshotId: Digest;
  policySnapshotId: Digest;
  requestedCapabilities: string[];
  selectedProviders: Array<{
    providerId: string;
    integrationIds: string[];
    capabilities: string[];
    reasonCode: string;
    reason: string;
  }>;
  rejectedProviders: Array<{
    providerId: string;
    reasonCode: string;
    reason: string;
  }>;
  ownership: Array<{
    providerId: string;
    domain: string;
    scope: string;
    properties: string[];
  }>;
  constraints: Array<{
    code: string;
    status: "failed" | "not-applicable" | "passed";
    message: string;
  }>;
  uncertainty: number;
  requiredInput: string[];
  digest: Digest;
}

export interface ExecutionPlan {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "execution-plan";
  executionPlanId: string;
  createdAt: string;
  routePlanId: string;
  mode: "apply" | "plan";
  immutableDigest: Digest;
  fileChanges: Array<{
    operation: "create" | "delete" | "update";
    path: string;
    contentDigest: Digest | null;
  }>;
  dependencyChanges: Array<{
    operation: "add" | "remove" | "update";
    workspace: string;
    package: string;
    version: null | string;
    kind: "dependency" | "devDependency" | "optionalDependency" | "peerDependency";
    reason: string;
  }>;
  commands: Array<{
    argv: string[];
    cwd: string;
    timeoutSeconds: number;
    networkRequired: boolean;
  }>;
  networkDestinations: string[];
  credentials: string[];
  rollback: string[];
  verification: string[];
  approval: {
    required: boolean;
    scopes: Array<"command-execution" | "credential-use" | "network" | "project-write" | "release">;
  };
}

export interface EvidenceCheck {
  id: string;
  required: boolean;
  status: VerificationState;
  diagnostics: Array<{
    code: string;
    message: string;
  }>;
  artifacts: Digest[];
}

export interface EvidenceEnvelope {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "evidence-envelope";
  evidenceId: string;
  digest: Digest;
  projectSnapshot: Digest;
  catalogSnapshot: Digest;
  policySnapshot: Digest;
  routePlan: {
    id: string;
    digest: Digest;
  };
  executionPlan: {
    id: string;
    digest: Digest;
  };
  checks: EvidenceCheck[];
  unverified: string[];
}

export interface SorenSdkLock {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "soren-sdk-lock";
  generatedAt: string;
  capabilityOntologyVersion: string;
  catalogSnapshotDigest: Digest;
  policySnapshotDigest: Digest;
  projectSnapshotDigest: Digest;
  configDigest: Digest;
  routePlanId: string;
  routePlanDigest: Digest;
  connectors: Array<{
    id: string;
    connectorVersion: string;
    digest: Digest;
    integrations: Array<{
      id: string;
      versionStatus: "not-applicable" | "resolved" | "unresolved";
      version?: string;
      digest?: string;
    }>;
  }>;
  unavailable: Array<{
    id: string;
    reasonCode: string;
    reason: string;
  }>;
  protocolResolutions: Array<{
    name: string;
    version: string;
    extensions: string[];
  }>;
  runtimeResolutions: Array<{
    name: string;
    version: string;
    integrity: string;
  }>;
  digest: Digest;
}

export interface ErrorEnvelope {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "error-envelope";
  code: string;
  message: string;
  safeToContinue: boolean;
  entity?: string;
  remediation?: string;
  details?: Record<string, JsonValue>;
}
