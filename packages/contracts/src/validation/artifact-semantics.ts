import type {
  ConnectorManifest,
  IntegrationArtifact
} from "../types/index.js";
import type { ContractIssue } from "../errors/index.js";

const IMMUTABLE_CONTENT_PIN = /(?:^|[\/@_-])[0-9a-f]{40,64}(?:$|[/?#._-])/i;

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

function isRemoteSource(source: string): boolean {
  try {
    const protocol = new URL(source).protocol.toLowerCase();
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function declaresRemoteExposure(integration: IntegrationArtifact): boolean {
  return integration.dataExposure.startsWith("remote-");
}

function isRemoteAgentSkill(integration: IntegrationArtifact): boolean {
  return integration.kind === "agent-skill" && isRemoteSource(integration.source);
}

function hasImmutableContentPin(integration: IntegrationArtifact): boolean {
  return IMMUTABLE_CONTENT_PIN.test(integration.source);
}

export function validateArtifactSemantics(
  manifest: ConnectorManifest
): ContractIssue[] {
  const issues: ContractIssue[] = [];

  for (const [index, integration] of manifest.integrations.entries()) {
    if (
      isRemoteAgentSkill(integration) &&
      !declaresRemoteExposure(integration)
    ) {
      issues.push(
        issue(
          `/integrations/${index}/dataExposure`,
          "agent-skill-exposure",
          "HTTP(S) Agent Skill sources must declare a remote data-exposure classification."
        )
      );
    }

    if (
      isRemoteAgentSkill(integration) &&
      integration.status === "available" &&
      (integration.version.status !== "resolved" ||
        !hasImmutableContentPin(integration))
    ) {
      issues.push(
        issue(
          `/integrations/${index}/source`,
          "available-agent-skill-pin",
          "Available remote Agent Skills must declare a resolved version and an immutable commit or content digest in the source URL, or remain unverified."
        )
      );
    }
  }

  return issues;
}
