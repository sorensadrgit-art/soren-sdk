import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  projectFixture,
  requestFixture
} from "./router-fixtures.js";

describe("Phase 4 duplicate capability semantics", () => {
  it("rejects duplicate capability IDs with conflicting quality deterministically", () => {
    const project = projectFixture();
    const first = requestFixture({
      required: ["motion.layout"],
      projectSnapshotId: project.snapshotId
    });
    first.capabilities = [
      {
        id: "motion.layout",
        required: true,
        quality: { scope: "hero", property: "transform" }
      },
      {
        id: "motion.layout",
        required: true,
        quality: { scope: "card-grid", property: "layout" }
      }
    ];
    const second = {
      ...first,
      capabilities: [...first.capabilities].reverse()
    };

    for (const request of [first, second]) {
      expect(() =>
        routeCapabilities({
          request,
          project,
          catalog: new MemoryCatalogFixture()
        })
      ).toThrow('Duplicate capability ID "motion.layout" is not allowed.');
    }
  });
});
