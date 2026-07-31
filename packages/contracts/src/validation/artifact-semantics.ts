import type {
  ConnectorManifest,
  IntegrationArtifact
} from "../types/index.js";
import type { ContractIssue } from "../errors/index.js";

const IMMUTABLE_COMMIT = /^[0-9a-f]{40,64}$/i;
const IMMUTABLE_DIGEST = /^sha256:[0-9a-f]{64}$/;

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
    const url = new URL(source);
    const protocol = url.protocol.toLowerCase();
    if (protocol === "data:") return false;
    if (protocol === "file:") {
      const host = url.hostname.toLowerCase();
      return host !== "" && host !== "localhost";
    }
    return true;
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
  if (integration.version.status !== "resolved") return false;
  return (
    (integration.version.commit !== undefined &&
      IMMUTABLE_COMMIT.test(integration.version.commit)) ||
    (integration.version.digest !== undefined &&
      IMMUTABLE_DIGEST.test(integration.version.digest))
  );
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
          "Remote Agent Skill sources must declare a remote data-exposure classification."
        )
      );
    }

    if (
      integration.kind === "agent-skill" &&
      integration.status === "available" &&
      !hasImmutableContentPin(integration)
    ) {
      issues.push(
        issue(
          `/integrations/${index}/version`,
          "available-agent-skill-pin",
          "Available Agent Skills must declare a resolved immutable version.commit or version.digest pin, or remain unverified."
        )
      );
    }
  }

  return issues;
}
