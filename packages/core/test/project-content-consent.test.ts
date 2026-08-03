import { describe, expect, it } from "vitest";

import {
  createProjectContentConsent,
  createRunGrant,
  inventoryDigest,
  ReadOnlyToolGateway,
  type ProjectContentConsent,
  type ProjectContentConsentProvider,
  type ProjectContentRequest,
  type ReadOnlyToolProvider,
  type ToolInventory
} from "../src/context-gateway.js";
import { sha256Bytes } from "@soren-sdk/contracts";

const now = "2026-08-01T12:00:00Z";
const projectA = sha256Bytes("project-a");
const projectB = sha256Bytes("project-b");
const policyA = sha256Bytes("policy-a");
const policyB = sha256Bytes("policy-b");

function inventory(exposesProjectContent = false): ToolInventory {
  return {
    providerId: "remote-provider",
    protocolVersions: ["2025-11-25"],
    tools: [
      {
        id: "inspect-project",
        description: "Untrusted metadata.",
        readOnly: true,
        exposesProjectContent
      }
    ]
  };
}

function runGrant(toolInventory: ToolInventory) {
  return createRunGrant(
    {
      runId: "run-1",
      providerId: toolInventory.providerId,
      toolIds: ["inspect-project"],
      inventoryDigest: inventoryDigest(toolInventory),
      issuedAt: "2026-08-01T11:00:00Z",
      expiresAt: "2026-08-01T13:00:00Z",
      allowRemoteProjectContent: true
    },
    toolInventory,
    now
  );
}

function request(
  projectSnapshot = projectA,
  policySnapshot = policyA,
  scopes: ProjectContentRequest["scopes"] = ["source"]
): ProjectContentRequest {
  return { projectSnapshot, policySnapshot, scopes };
}

function consent(overrides: Partial<Omit<ProjectContentConsent, "digest">> = {}) {
  return createProjectContentConsent({
    subject: { kind: "run", id: "run-1" },
    projectSnapshot: projectA,
    providerId: "remote-provider",
    toolId: "inspect-project",
    allowedContentScope: ["source", "configuration"],
    policySnapshot: policyA,
    expiresAt: "2026-08-01T12:30:00Z",
    ...overrides
  });
}

function provider(toolInventory: ToolInventory): ReadOnlyToolProvider {
  return {
    inventory: () => toolInventory,
    call: () => ({ ok: true })
  };
}

function authority(record: ProjectContentConsent | undefined): ProjectContentConsentProvider {
  return { findConsent: () => record };
}

describe("remote project-content consent", () => {
  it("requires an authoritative consent record even when a tool claims it does not expose project content", () => {
    const toolInventory = inventory(false);
    const gateway = new ReadOnlyToolGateway(provider(toolInventory), () => now);

    expect(() => gateway.call(runGrant(toolInventory), "inspect-project", {}, now, request())).toThrow("consent");
  });

  it("rejects a forged consent returned with a mismatched digest", () => {
    const toolInventory = inventory();
    const valid = consent();
    const forged = { ...valid, providerId: "attacker-provider" };
    const gateway = new ReadOnlyToolGateway(provider(toolInventory), () => now, authority(forged));

    expect(() => gateway.call(runGrant(toolInventory), "inspect-project", {}, now, request())).toThrow("consent");
  });

  it("rejects consent bound to a different project snapshot", () => {
    const toolInventory = inventory();
    const gateway = new ReadOnlyToolGateway(provider(toolInventory), () => now, authority(consent()));

    expect(() => gateway.call(runGrant(toolInventory), "inspect-project", {}, now, request(projectB))).toThrow("consent");
  });

  it("rejects consent bound to a different provider or tool", () => {
    const toolInventory = inventory();
    const gateway = new ReadOnlyToolGateway(
      provider(toolInventory),
      () => now,
      authority(consent({ providerId: "another-provider" }))
    );

    expect(() => gateway.call(runGrant(toolInventory), "inspect-project", {}, now, request())).toThrow("consent");
  });

  it("rejects consent bound to a different run", () => {
    const toolInventory = inventory();
    const gateway = new ReadOnlyToolGateway(
      provider(toolInventory),
      () => now,
      authority(consent({ subject: { kind: "run", id: "run-2" } }))
    );

    expect(() => gateway.call(runGrant(toolInventory), "inspect-project", {}, now, request())).toThrow("consent");
  });

  it("rejects expired consent independently of the run grant", () => {
    const toolInventory = inventory();
    const gateway = new ReadOnlyToolGateway(
      provider(toolInventory),
      () => now,
      authority(consent({ expiresAt: "2026-08-01T11:59:59Z" }))
    );

    expect(() => gateway.call(runGrant(toolInventory), "inspect-project", {}, now, request())).toThrow("consent");
  });

  it("rejects policy snapshot drift", () => {
    const toolInventory = inventory();
    const gateway = new ReadOnlyToolGateway(provider(toolInventory), () => now, authority(consent()));

    expect(() => gateway.call(runGrant(toolInventory), "inspect-project", {}, now, request(projectA, policyB))).toThrow("consent");
  });

  it("rejects a requested scope that is narrower than no authorized scope", () => {
    const toolInventory = inventory();
    const gateway = new ReadOnlyToolGateway(
      provider(toolInventory),
      () => now,
      authority(consent({ allowedContentScope: ["configuration"] }))
    );

    expect(() => gateway.call(runGrant(toolInventory), "inspect-project", {}, now, request(projectA, policyA, ["source"]))).toThrow("consent");
  });

  it("allows only an exact authoritative binding and treats tool metadata as risk classification", () => {
    const toolInventory = inventory(true);
    const gateway = new ReadOnlyToolGateway(provider(toolInventory), () => now, authority(consent()));

    expect(gateway.call(runGrant(toolInventory), "inspect-project", {}, now, request(projectA, policyA, ["source"]))).toEqual({ ok: true });
  });
});
