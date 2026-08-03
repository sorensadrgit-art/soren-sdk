import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const servicePath = "packages/apply/src/apply-service.ts";
let service = readFileSync(servicePath, "utf8");

const optionsConflict = `  evidenceSink: ApplyEvidenceSink;\n<<<<<<< HEAD\n  sandboxProvider?: SandboxProvider;\n  /** Internal test-only capability. Production construction never enables apply. */\n  testCapability?: symbol;\n}\n\nconst TEST_APPLY_CAPABILITY = Symbol("soren-sdk.test-apply-capability");\n\n/** Creates an apply service for deterministic tests only. Public adapters stay disabled. */\nexport function createApplyServiceForTesting(\n  options: Omit<ApplyServiceOptions, "testCapability"> & Record<string, unknown>\n): DefaultApplyService {\n  return new DefaultApplyService({ ...options, testCapability: TEST_APPLY_CAPABILITY });\n=======\n  authoritativeState: AuthoritativeApplyStateProviders;\n>>>>>>> 8e7bcf6 (fix(apply): recheck authoritative state before mutation)\n}`;

const optionsResolved = `  evidenceSink: ApplyEvidenceSink;\n  sandboxProvider?: SandboxProvider;\n  authoritativeState: AuthoritativeApplyStateProviders;\n  /** Internal test-only capability. Production construction never enables apply. */\n  testCapability?: symbol;\n}\n\nconst TEST_APPLY_CAPABILITY = Symbol("soren-sdk.test-apply-capability");\n\n/** Creates an apply service for deterministic tests only. Public adapters stay disabled. */\nexport function createApplyServiceForTesting(\n  options: Omit<ApplyServiceOptions, "testCapability"> & Record<string, unknown>\n): DefaultApplyService {\n  return new DefaultApplyService({ ...options, testCapability: TEST_APPLY_CAPABILITY });\n}`;

const fieldsConflict = `  readonly #evidenceSink: ApplyEvidenceSink;\n<<<<<<< HEAD\n  readonly #sandboxProvider: SandboxProvider | undefined;\n=======\n  readonly #authoritativeState: AuthoritativeApplyStateProviders;\n>>>>>>> 8e7bcf6 (fix(apply): recheck authoritative state before mutation)\n  readonly #now: () => number;`;

const fieldsResolved = `  readonly #evidenceSink: ApplyEvidenceSink;\n  readonly #sandboxProvider: SandboxProvider | undefined;\n  readonly #authoritativeState: AuthoritativeApplyStateProviders;\n  readonly #now: () => number;`;

if (!service.includes(optionsConflict) || !service.includes(fieldsConflict)) {
  throw new Error("Expected Phase 9 conflict blocks were not found exactly; refusing to modify.");
}
service = service.replace(optionsConflict, optionsResolved).replace(fieldsConflict, fieldsResolved);
if (/^(<<<<<<<|=======|>>>>>>>)/m.test(service)) {
  throw new Error("Conflict markers remain after guarded repair.");
}
writeFileSync(servicePath, service);

const fixturePath = "packages/apply/test/original-fixture-integrity.ts";
let fixture = readFileSync(fixturePath, "utf8");
const before = `import { lstat, readdir, readFile, readlink, stat } from "node:fs/promises";`;
const after = `import { lstat, readdir, readFile, readlink } from "node:fs/promises";`;
if (!fixture.includes(before)) {
  throw new Error("Expected unused stat import was not found exactly; refusing to modify.");
}
fixture = fixture.replace(before, after);
writeFileSync(fixturePath, fixture);

unlinkSync("scripts/repair-phase9-durability-conflict.mjs");
unlinkSync(".github/workflows/repair-phase9-durability.yml");
