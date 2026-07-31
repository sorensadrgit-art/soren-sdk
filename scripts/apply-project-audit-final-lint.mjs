import { readFileSync, writeFileSync } from "node:fs";
const path = "packages/core/src/router/route-capabilities-workspace-reuse.ts";
let source = readFileSync(path, "utf8");
const replacements = [
  [
    `function runtimePackageTargets(\n  input: RouteInput,\n  routeWorkspaces: readonly string[]\n): Map<string, RuntimePackageTarget> {`,
    `function runtimePackageTargets(\n  input: RouteInput\n): Map<string, RuntimePackageTarget> {`
  ],
  [
    `  const packages = runtimePackageTargets(input, workspaces);`,
    `  const packages = runtimePackageTargets(input);`
  ]
];
for (const [before, after] of replacements) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one audited fragment, found ${count}.`);
  source = source.replace(before, after);
}
writeFileSync(path, source, "utf8");
