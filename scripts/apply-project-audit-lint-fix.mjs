import { readFileSync, writeFileSync } from "node:fs";

const path = "packages/core/src/router/route-capabilities-workspace-reuse.ts";
let source = readFileSync(path, "utf8");
const replacements = [
  [
    `function providerTargetWorkspaces(\n  request: RouteRequest,\n  record: Extract<ConnectorRecord, { kind: \"schema-v2\" }>,\n  routeWorkspaces: readonly string[]\n): string[] {`,
    `function providerTargetWorkspaces(\n  request: RouteRequest,\n  record: Extract<ConnectorRecord, { kind: \"schema-v2\" }>\n): string[] {`
  ],
  [
    `    const workspaces = providerTargetWorkspaces(\n      input.request,\n      record,\n      routeWorkspaces\n    );`,
    `    const workspaces = providerTargetWorkspaces(input.request, record);`
  ]
];
for (const [before, after] of replacements) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one audited fragment, found ${count}.`);
  source = source.replace(before, after);
}
writeFileSync(path, source, "utf8");
