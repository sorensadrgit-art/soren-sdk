import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  ContractValidator,
  validateCapabilityCatalog,
  validateConnectorManifest,
  type ContractIssue
} from "../index.js";

export interface RepositoryValidationReport {
  errors: Array<{ path: string; issues: readonly ContractIssue[] }>;
  warnings: string[];
  validatedConnectors: string[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export function validateRepository(root: string): RepositoryValidationReport {
  const report: RepositoryValidationReport = {
    errors: [],
    warnings: [],
    validatedConnectors: []
  };

  // Construction validates every registered schema.
  new ContractValidator();

  const capabilityPath = join(root, "capabilities", "catalog.json");
  const capabilityValue = readJson(capabilityPath);
  const capabilityResult = validateCapabilityCatalog(capabilityValue);
  if (!capabilityResult.ok) {
    report.errors.push({
      path: capabilityPath,
      issues: capabilityResult.issues
    });
    return report;
  }

  const connectorRoot = join(root, "sdk-connectors");
  for (const directoryName of readdirSync(connectorRoot).sort()) {
    if (directoryName.startsWith("_")) {
      continue;
    }

    const manifestPath = join(connectorRoot, directoryName, "sdk.manifest.json");
    let value: unknown;
    try {
      value = readJson(manifestPath);
    } catch {
      continue;
    }

    if (
      typeof value !== "object" ||
      value === null ||
      !("schemaVersion" in value) ||
      value.schemaVersion !== "2.0.0-draft.1"
    ) {
      report.warnings.push(
        `${manifestPath}: legacy planning manifest skipped until Schema v2 migration.`
      );
      continue;
    }

    const result = validateConnectorManifest(value, {
      expectedPublisher: "soren-sdk",
      capabilityCatalog: capabilityResult.value
    });
    if (!result.ok) {
      report.errors.push({ path: manifestPath, issues: result.issues });
      continue;
    }

    report.validatedConnectors.push(directoryName);
  }

  return report;
}

function formatIssue(issue: ContractIssue): string {
  return `${issue.instancePath || "/"} ${issue.keyword}: ${issue.message}`;
}

async function main(): Promise<void> {
  const root = resolve(process.cwd(), "../..");
  const report = validateRepository(root);

  for (const warning of report.warnings) {
    console.warn(`warning: ${warning}`);
  }

  for (const failure of report.errors) {
    console.error(`error: ${failure.path}`);
    for (const issue of failure.issues) {
      console.error(`  - ${formatIssue(issue)}`);
    }
  }

  console.log(
    `Validated ${report.validatedConnectors.length} Schema v2 connector(s); ` +
      `${report.warnings.length} warning(s); ${report.errors.length} error(s).`
  );

  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  await main();
}
