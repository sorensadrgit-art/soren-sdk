import { describe, expect, it } from "vitest";
import type { Digest, SorenSdkLock } from "@soren-sdk/contracts";
import {
  LockfileError,
  LockfileService,
  computeLockDigest,
  type CreateLockfileInput,
  type CurrentResolutionInputs,
  type SelectedConnector,
} from "../src/index.js";

function sha(n: number): Digest {
  return `sha256:${n.toString(16).padStart(64, "0")}`;
}

function integration(id: string, status: "resolved" | "unresolved" = "resolved") {
  return {
    id,
    versionStatus: status as "resolved" | "unresolved",
    ...(status === "resolved"
      ? { version: "0.2.0", digest: sha(42) }
      : {}),
  };
}

function connector(id: string): SelectedConnector {
  return {
    id,
    connectorVersion: "0.2.0",
    digest: sha(42),
    integrations: [integration(`${id}-integration`)],
  };
}

function validInput(overrides: Partial<CreateLockfileInput> = {}): CreateLockfileInput {
  return {
    projectSnapshotId: sha(1),
    catalogSnapshotId: sha(2),
    policySnapshotId: sha(3),
    configDigest: sha(4),
    routePlanId: "route-plan-web-platform-example",
    routePlanDigest: sha(5),
    capabilityOntologyVersion: "1.0.0-draft.1",
    connectors: [connector("web-platform"), connector("motion")],
    unavailable: [
      {
        id: "gsap",
        reasonCode: "LICENSE_BLOCKED",
        reason: "gsap is not permitted by the active policy.",
      },
    ],
    generatedAt: "2026-07-27T12:00:00Z",
    ...overrides,
  };
}

describe("LockfileService.create", () => {
  const service = new LockfileService();

  it("creates a deterministic lock with a stable digest", () => {
    const a = service.create(validInput());
    const b = service.create(validInput());
    expect(a.digest).toBe(b.digest);
    expect(a.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a.connectors.map((c) => c.id)).toEqual(["motion", "web-platform"]);
  });

  it("produces an identical digest when inputs are reordered", () => {
    const base = validInput();
    const reordered = validInput({
      connectors: [connector("motion"), connector("web-platform")],
      unavailable: [
        { id: "gsap", reasonCode: "LICENSE_BLOCKED", reason: "gsap is not permitted by the active policy." },
      ],
    });
    const a = service.create(base);
    const b = service.create(reordered);
    expect(a.digest).toBe(b.digest);
  });

  it("does not change the digest when generatedAt varies", () => {
    const a = service.create(validInput({ generatedAt: "2026-07-27T12:00:00Z" }));
    const b = service.create(validInput({ generatedAt: "2026-07-28T00:00:00Z" }));
    expect(a.digest).toBe(b.digest);
  });

  it("computeLockDigest independently recomputed equals lock.digest", () => {
    const lock = service.create(validInput());
    const rest = Object.fromEntries(
      Object.entries(lock).filter(([key]) => key !== "digest")
    ) as unknown as Omit<SorenSdkLock, "digest">;
    expect(computeLockDigest(rest)).toBe(lock.digest);
  });

  it("rejects credential-like string values", () => {
    try {
      service.create(
        validInput({
          unavailable: [
            { id: "gsap", reasonCode: "AUTH", reason: "contains api-key value" },
          ],
        })
      );
      throw new Error("expected LOCK_CREDENTIAL_REJECTED");
    } catch (error) {
      expect(error).toBeInstanceOf(LockfileError);
      expect((error as LockfileError).code).toBe("LOCK_CREDENTIAL_REJECTED");
    }
  });

  it("rejects absolute path values", () => {
    try {
      service.create(validInput({ routePlanId: "/etc/passwd" }));
      throw new Error("expected LOCK_ABSOLUTE_PATH_REJECTED");
    } catch (error) {
      expect(error).toBeInstanceOf(LockfileError);
      expect((error as LockfileError).code).toBe("LOCK_ABSOLUTE_PATH_REJECTED");
    }
  });
});

describe("LockfileService.validate", () => {
  const service = new LockfileService();

  it("accepts a lock produced by create", () => {
    const lock = service.create(validInput());
    const result = service.validate(lock);
    expect(result.ok).toBe(true);
  });

  it("rejects a tampered digest", () => {
    const lock = service.create(validInput());
    const tampered: SorenSdkLock = { ...lock, digest: sha(99) };
    const result = service.validate(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(" ")).toMatch(/digest/i);
    }
  });

  it("rejects a tampered bound field via digest mismatch", () => {
    const lock = service.create(validInput());
    const tampered: SorenSdkLock = { ...lock, routePlanId: "swapped-plan" };
    const result = service.validate(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(" ")).toMatch(/digest/i);
    }
  });

  it("rejects a structurally invalid lock", () => {
    const result = service.validate({ not: "a lock" } as unknown as SorenSdkLock);
    expect(result.ok).toBe(false);
  });
});

describe("LockfileService.compare", () => {
  const service = new LockfileService();

  function current(
    overrides: Partial<CurrentResolutionInputs> = {}
  ): CurrentResolutionInputs {
    return {
      projectSnapshotId: sha(1),
      catalogSnapshotId: sha(2),
      policySnapshotId: sha(3),
      configDigest: sha(4),
      routePlanId: "route-plan-web-platform-example",
      routePlanDigest: sha(5),
      ...overrides,
    };
  }

  it("reports inSync for a matching lock", () => {
    const lock = service.create(validInput());
    const report = service.compare(lock, current());
    expect(report.inSync).toBe(true);
    expect(report.drifts).toEqual([]);
  });

  it("reports critical drift for each bound field", () => {
    const lock = service.create(validInput());
    const cases: Array<Partial<CurrentResolutionInputs>> = [
      { projectSnapshotId: sha(90) },
      { catalogSnapshotId: sha(90) },
      { policySnapshotId: sha(90) },
      { configDigest: sha(90) },
      { routePlanDigest: sha(90) },
      { routePlanId: "different-plan" },
    ];
    for (const overrides of cases) {
      const report = service.compare(lock, current(overrides));
      expect(report.inSync).toBe(false);
      expect(report.drifts.some((drift) => drift.severity === "critical")).toBe(
        true
      );
    }
  });

  it("reports a missing connector in current as critical", () => {
    const lock = service.create(
      validInput({ connectors: [connector("web-platform")] })
    );
    const report = service.compare(lock, {
      ...current(),
      connectors: [],
    });
    expect(report.inSync).toBe(false);
    const connectorDrift = report.drifts.find((drift) =>
      drift.field.startsWith("connectors.")
    );
    expect(connectorDrift?.severity).toBe("critical");
  });

  it("reports every selected connector and integration mutation as critical drift", () => {
    const lock = service.create(validInput({ connectors: [connector("web-platform")] }));
    const baseline = connector("web-platform");
    const cases: SelectedConnector[] = [
      { ...baseline, connectorVersion: "9.9.9" },
      { ...baseline, digest: sha(99) },
      { ...baseline, integrations: [{ ...baseline.integrations[0] ?? integration("missing"), version: "9.9.9" }] },
      { ...baseline, integrations: [{ ...baseline.integrations[0] ?? integration("missing"), digest: sha(99) }] },
      { ...baseline, integrations: [{ id: "web-platform-integration", versionStatus: "unresolved" }] },
      { ...baseline, integrations: [] },
      { ...baseline, integrations: [...baseline.integrations, integration("additional")] }
    ];
    for (const changed of cases) {
      const report = service.compare(lock, { ...current(), connectors: [changed] });
      expect(report.inSync).toBe(false);
      expect(report.drifts.some((drift) => drift.severity === "critical")).toBe(true);
    }
  });
});
