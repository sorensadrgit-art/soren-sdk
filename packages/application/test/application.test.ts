import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

import { createDefaultSorenApplication } from "../src/index.js";

const repoRoot = resolve(process.cwd(), "../..");

describe("Soren application", () => {
  it("lists connectors through the transport-neutral application boundary", async () => {
    const app = createDefaultSorenApplication(repoRoot);
    const result = await app.catalogList({});
    expect(result.connectors.map((connector) => connector.directoryId)).toContain(
      "web-platform"
    );
    expect(result.snapshot.contractKind).toBe("catalog-snapshot");
  });

  it("returns deterministic fake output for unfinished neighboring phases", async () => {
    const app = createDefaultSorenApplication(repoRoot);
    const route = await app.route({ request: { text: "animate a card" } });
    const policy = await app.resolvePolicy({ request: { connector: "gsap" } });
    expect(route).toMatchObject({
      status: "unavailable",
      code: "NOT_IMPLEMENTED",
      replacementPhase: "phase-4"
    });
    expect(policy).toMatchObject({
      status: "unavailable",
      code: "NOT_IMPLEMENTED",
      replacementPort: "ResolvedPolicyProvider"
    });
    expect(route.requestDigest).toBe(policy.requestDigest.replace(policy.requestDigest, route.requestDigest));
  });
});
