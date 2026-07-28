import { describe, expect, it } from "vitest";

import { MigrationRegistry } from "../../src/index.js";

describe("MigrationRegistry", () => {
  it("registers and retrieves explicit migrations", () => {
    const registry = new MigrationRegistry();
    const migration = {
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
      migrate: (input: unknown) => input
    };

    registry.register(migration);

    expect(registry.get("1.0.0", "2.0.0")).toBe(migration);
  });

  it("rejects duplicate migration edges", () => {
    const registry = new MigrationRegistry();
    const migration = {
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
      migrate: (input: unknown) => input
    };

    registry.register(migration);
    expect(() => registry.register(migration)).toThrow(
      'Migration "1.0.0->2.0.0" is already registered.'
    );
  });
});
