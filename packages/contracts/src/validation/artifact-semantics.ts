import type {
  ConnectorManifest,
  IntegrationArtifact
} from "../types/index.js";
import type { ContractIssue } from "../errors/index.js";

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

function isRemoteAgentSkill(integration: IntegrationArtifact): boolean {
  return (
    integration.kind === "agent-skill" &&
    integration.dataExposure.startsWith("remote-")
  );
}

export function validateArtifactSemantics(
  manifest: ConnectorManifest
): ContractIssue[] {
  const issues: ContractIssue[] = [];

  for (const [index, integration] of manifest.integrations.entries()) {
    if (
      isRemoteAgentSkill(integration) &&
      integration.status === "available" &&
      integration.version.status !== "resolved"
    ) {
      issues.push(
        issue(
          `/integrations/${index}/version/status`,
          "available-agent-skill-pin",
          "Available remote Agent Skills must declare an immutable resolved version or remain unverified."
        )
      );
    }
  }

  return issues;
}
