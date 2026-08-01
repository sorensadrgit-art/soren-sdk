import { readFileSync, writeFileSync } from "node:fs";

const path = "packages/apply/src/apply-service.ts";
let source = readFileSync(path, "utf8");
const original = source;

source = source.replace(
  /<<<<<<< HEAD\n  sandboxProvider\?: SandboxProvider;\n  \/\*\* Internal test-only capability\. Production construction never enables apply\. \*\/\n  testCapability\?: symbol;\n}\n\nconst TEST_APPLY_CAPABILITY = Symbol\("soren-sdk\.test-apply-capability"\);\n\n\/\*\* Creates an apply service for deterministic tests only\. Public adapters stay disabled\. \*\/\nexport function createApplyServiceForTesting\(\n  options: Omit<ApplyServiceOptions, "testCapability"> & Record<string, unknown>\n\): DefaultApplyService \{\n  return new DefaultApplyService\(\{ \.\.\.options, testCapability: TEST_APPLY_CAPABILITY \}\);\n=======\n  authoritativeState: AuthoritativeApplyStateProviders;\n>>>>>>> 8e7bcf6 \(fix\(apply\): recheck authoritative state before mutation\)\n}/,
  `  sandboxProvider?: SandboxProvider;\n  authoritativeState: AuthoritativeApplyStateProviders;\n  /** Internal test-only capability. Production construction never enables apply. */\n  testCapability?: symbol;\n}\n\nconst TEST_APPLY_CAPABILITY = Symbol("soren-sdk.test-apply-capability");\n\n/** Creates an apply service for deterministic tests only. Public adapters stay disabled. */\nexport function createApplyServiceForTesting(\n  options: Omit<ApplyServiceOptions, "testCapability"> & Record<string, unknown>\n): DefaultApplyService {\n  return new DefaultApplyService({ ...options, testCapability: TEST_APPLY_CAPABILITY });\n}`
);

source = source.replace(
  /<<<<<<< HEAD\n  readonly #sandboxProvider: SandboxProvider \| undefined;\n=======\n  readonly #authoritativeState: AuthoritativeApplyStateProviders;\n>>>>>>> 8e7bcf6 \(fix\(apply\): recheck authoritative state before mutation\)/,
  `  readonly #sandboxProvider: SandboxProvider | undefined;\n  readonly #authoritativeState: AuthoritativeApplyStateProviders;`
);

if (source.includes("<<<<<<<") || source.includes("=======") || source.includes(">>>>>>>")) {
  throw new Error("Unresolved conflict markers remain in apply-service.ts");
}
if (source === original) throw new Error("Expected guarded conflict replacements were not applied");
writeFileSync(path, source);

const fixturePath = "packages/apply/test/original-fixture-integrity.ts";
let fixture = readFileSync(fixturePath, "utf8");
const updatedFixture = fixture.replace(
  'import { lstat, readdir, readFile, readlink, stat } from "node:fs/promises";',
  'import { lstat, readdir, readFile, readlink } from "node:fs/promises";'
);
if (fixture === updatedFixture) throw new Error("Expected unused stat import was not found");
writeFileSync(fixturePath, updatedFixture);
