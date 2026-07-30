import type {
  CapabilityCatalog,
  ConnectorManifest,
  IntegrationArtifact,
  OwnershipClaim
} from "../types/index.js";
import type { ContractIssue } from "../errors/index.js";

const PLACEHOLDER_VERSION =
  /(?:define during implementation|todo|tbd|unknown version|replace[- ]?me)/i;

function issue(
  instancePath: string,
  keyword: string,
  message: string
): ContractIssue {
  return {
    instancePath,
    schemaPath: "#/semantic",
    keyword,
    message,
    params: {}
  };
}

function hasRemoteExposure(integration: IntegrationArtifact): boolean {
  return integration.dataExposure.startsWith("remote-");
}

function ownershipProperties(claim: OwnershipClaim): null | Set<string> {
  if (claim.properties === undefined || claim.properties.length === 0) {
    return null;
  }
  return new Set(claim.properties);
}

function ownershipClaimsOverlap(a: OwnershipClaim, b: OwnershipClaim): boolean {
  if (!a.exclusive || !b.exclusive || a.domain !== b.domain || a.scope !== b.scope) {
    return false;
  }

  const aProperties = ownershipProperties(a);
  const bProperties = ownershipProperties(b);

  if (aProperties === null || bProperties === null) {
    return true;
  }

  return [...aProperties].some((property) => bProperties.has(property));
}

export interface ConnectorSemanticOptions {
  expectedPublisher?: string;
  capabilityCatalog?: CapabilityCatalog;
}

export function validateConnectorSemantics(
  manifest: ConnectorManifest,
  options: ConnectorSemanticOptions = {}
): ContractIssue[] {
  const issues: ContractIssue[] = [];

  if (
    options.expectedPublisher !== undefined &&
    manifest.connector.publisher !== options.expectedPublisher
  ) {
    issues.push(
      issue(
        "/connector/publisher",
        "publisher",
        `Connector publisher must be "${options.expectedPublisher}" in this catalog.`
      )
    );
  }

  if (manifest.connector.selectable) {
    if (!["approved", "stable"].includes(manifest.connector.reviewStatus)) {
      issues.push(
        issue(
          "/connector/reviewStatus",
          "selectable-status",
          "Selectable connectors must be approved or stable."
        )
      );
    }

    if (manifest.connector.blockers.length > 0) {
      issues.push(
        issue(
          "/connector/blockers",
          "selectable-blockers",
          "Selectable connectors cannot have unresolved blockers."
        )
      );
    }
  }

  const capabilityIds = new Set(
    options.capabilityCatalog?.capabilities.map((capability) => capability.id) ?? []
  );

  for (const [index, claim] of manifest.capabilityClaims.entries()) {
    if (options.capabilityCatalog !== undefined && !capabilityIds.has(claim.capability)) {
      issues.push(
        issue(
          `/capabilityClaims/${index}/capability`,
          "unknown-capability",
          `Capability "${claim.capability}" is not present in the capability catalog.`
        )
      );
    }
  }

  for (const [index, integration] of manifest.integrations.entries()) {
    const base = `/integrations/${index}`;

    if (
      integration.version.status === "resolved" &&
      integration.version.value !== undefined &&
      PLACEHOLDER_VERSION.test(integration.version.value)
    ) {
      issues.push(
        issue(
          `${base}/version/value`,
          "version-placeholder",
          "Resolved versions cannot contain planning placeholders."
        )
      );
    }

    if (
      integration.authorization.required &&
      integration.authorization.method === "none"
    ) {
      issues.push(
        issue(
          `${base}/authorization/method`,
          "authorization-method",
          "An integration requiring authorization must declare an authorization method."
        )
      );
    }

    if (
      integration.kind === "mcp-server" &&
      hasRemoteExposure(integration) &&
      integration.permissions.network.length === 0
    ) {
      issues.push(
        issue(
          `${base}/permissions/network`,
          "remote-network-scope",
          "Remote MCP integrations must declare at least one network destination."
        )
      );
    }

    if (
      integration.kind === "mcp-server" &&
      integration.status === "available" &&
      (integration.protocol?.name !== "mcp" ||
        integration.protocol.supportedVersions.length === 0)
    ) {
      issues.push(
        issue(
          `${base}/protocol/supportedVersions`,
          "available-mcp-protocol-version",
          "Available MCP integrations must declare at least one verified supported protocol version."
        )
      );
    }

    if (
      manifest.connector.selectable &&
      integration.status === "available" &&
      integration.version.status === "unresolved"
    ) {
      issues.push(
        issue(
          `${base}/version/status`,
          "selectable-version",
          "Selectable connectors cannot depend on an available integration with an unresolved version."
        )
      );
    }

    if (
      manifest.connector.selectable &&
      ["runtime-package", "agent-skill", "mcp-server"].includes(integration.kind) &&
      (integration.licenseExpression === undefined ||
        integration.licenseExpression === "NOASSERTION")
    ) {
      issues.push(
        issue(
          `${base}/licenseExpression`,
          "selectable-license",
          "Selectable connectors require resolved license metadata for executable or installable artifacts."
        )
      );
    }
  }

  for (let left = 0; left < manifest.ownershipClaims.length; left += 1) {
    for (
      let right = left + 1;
      right < manifest.ownershipClaims.length;
      right += 1
    ) {
      const a = manifest.ownershipClaims[left];
      const b = manifest.ownershipClaims[right];
      if (a !== undefined && b !== undefined && ownershipClaimsOverlap(a, b)) {
        issues.push(
          issue(
            `/ownershipClaims/${right}`,
            "ownership-conflict",
            `Exclusive ownership overlaps with ownershipClaims/${left}.`
          )
        );
      }
    }
  }

  return issues;
}
