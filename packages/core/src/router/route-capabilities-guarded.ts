import {
  assertContract,
  type ProjectSnapshot,
  type RouteRequest
} from "@soren-sdk/contracts";

import { routeCapabilities as routeCapabilitiesFinal } from "./route-capabilities-final.js";
import type { RouteInput } from "./types.js";

type Version = readonly [number, number, number];
const MOTION_MINIMUM_REACT: Version = [18, 2, 0];
const SEMVER_PRERELEASE = /v?\d+(?:\.\d+){1,2}-[0-9A-Za-z]/;

function selectedWorkspace(request: RouteRequest): string | null {
  const workspaces = new Set(
    request.capabilities
      .filter((capability) => capability.required)
      .map((capability) => capability.quality?.workspace)
      .filter(
        (workspace): workspace is string =>
          typeof workspace === "string" && workspace.trim().length > 0
      )
      .map((workspace) => workspace.trim())
  );
  return workspaces.size === 1 ? [...workspaces][0] ?? null : null;
}

function isRootOrSelected(
  workspace: string | null | undefined,
  selected: string
): boolean {
  const normalized = workspace ?? ".";
  return normalized === "." || normalized === selected;
}

function parseVersion(value: string): Version | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(value.trim());
  if (match === null) return null;
  return [
    Number.parseInt(match[1] ?? "0", 10),
    Number.parseInt(match[2] ?? "0", 10),
    Number.parseInt(match[3] ?? "0", 10)
  ];
}

function compareVersions(left: Version, right: Version): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function normalizeRange(value: string): string {
  let range = value.trim();
  if (range.startsWith("workspace:")) {
    range = range.slice("workspace:".length).trim();
  }
  if (range.startsWith("npm:")) {
    const separator = range.lastIndexOf("@");
    if (separator > "npm:".length) range = range.slice(separator + 1);
  }
  return range;
}

function wildcardMinimum(value: string): Version | null {
  const match = /^v?(\d+)(?:\.(\d+))?\.(?:x|\*)$/i.exec(value.trim());
  if (match === null) return null;
  return [
    Number.parseInt(match[1] ?? "0", 10),
    Number.parseInt(match[2] ?? "0", 10),
    0
  ];
}

function clauseMinimum(clause: string): Version | null {
  const normalized = clause.trim();
  if (
    normalized === "" ||
    normalized === "*" ||
    /\blatest\b/i.test(normalized) ||
    SEMVER_PRERELEASE.test(normalized)
  ) {
    return null;
  }

  const wildcard = wildcardMinimum(normalized);
  if (wildcard !== null) return wildcard;
  if (/[x*]/i.test(normalized)) return null;

  const hyphen = /^(v?\d+(?:\.\d+){0,2})\s+-\s+v?\d+(?:\.\d+){0,2}$/.exec(
    normalized
  );
  if (hyphen !== null) return parseVersion(hyphen[1] ?? "");

  if (/^[\^~]/.test(normalized)) return parseVersion(normalized.slice(1));

  const lowerBound = /(?:^|\s)(>=|>)\s*(v?\d+(?:\.\d+){0,2})(?:\s|$)/.exec(
    normalized
  );
  if (lowerBound !== null) return parseVersion(lowerBound[2] ?? "");

  if (/^(?:<|<=)/.test(normalized)) return null;

  const exact = /^(?:=\s*)?(v?\d+(?:\.\d+){0,2})$/.exec(normalized);
  return exact === null ? null : parseVersion(exact[1] ?? "");
}

function reactRangeGuaranteesMinimum(value: string): boolean {
  return normalizeRange(value)
    .split("||")
    .every((clause) => {
      const minimum = clauseMinimum(clause);
      return (
        minimum !== null &&
        compareVersions(minimum, MOTION_MINIMUM_REACT) >= 0
      );
    });
}

function guardedReactVersion(version: string | null): string | null {
  if (version === null) return null;
  return reactRangeGuaranteesMinimum(version) ? version : "17.0.0";
}

function browserQuery(target: string): string {
  const trimmed = target.trim();
  const environmentPrefix = /^[A-Za-z0-9_-]+:(.*)$/.exec(trimmed);
  return (environmentPrefix?.[1] ?? trimmed).trim();
}

function hasPositiveBrowserTarget(target: string): boolean {
  return target
    .split(",")
    .map(browserQuery)
    .some(
      (clause) =>
        clause.length > 0 && !clause.toLowerCase().startsWith("not ")
    );
}

function routedReactWorkspace(
  name: string,
  current: string | null | undefined,
  selected: string | null
): string {
  const normalized = current ?? ".";
  return name === "react" && selected !== null && normalized === "."
    ? selected
    : normalized;
}

function guardedProject(
  project: ProjectSnapshot,
  workspace: string | null
): ProjectSnapshot {
  const declaredBrowsers = project.targets.browsers.filter(
    (target) => !/^\s*\[[^\]]+\]\s*$/.test(target)
  );
  const browsers = declaredBrowsers.some(hasPositiveBrowserTarget)
    ? declaredBrowsers
    : ["ie 11"];
  const dependencies =
    workspace === null
      ? project.dependencies
      : project.dependencies.filter((dependency) =>
          isRootOrSelected(dependency.workspace, workspace)
        );
  const frameworks =
    workspace === null
      ? project.frameworks
      : project.frameworks.filter((framework) =>
          isRootOrSelected(framework.workspace, workspace)
        );
  const selectedReactVersions = [
    ...dependencies
      .filter((dependency) => dependency.name === "react")
      .map((dependency) => dependency.version),
    ...frameworks
      .filter((framework) => framework.name === "react")
      .map((framework) => framework.version)
  ];
  const selectedWorkspaceReactUnsupported =
    workspace !== null &&
    selectedReactVersions.some(
      (version) => version === null || !reactRangeGuaranteesMinimum(version)
    );

  return {
    ...project,
    dependencies: dependencies.map((dependency) =>
      dependency.name === "react"
        ? {
            ...dependency,
            workspace: routedReactWorkspace(
              dependency.name,
              dependency.workspace,
              workspace
            ),
            version: selectedWorkspaceReactUnsupported
              ? "17.0.0"
              : guardedReactVersion(dependency.version) ?? dependency.version
          }
        : dependency
    ),
    frameworks: frameworks.map((framework) =>
      framework.name === "react"
        ? {
            ...framework,
            workspace: routedReactWorkspace(
              framework.name,
              framework.workspace,
              workspace
            ),
            version: selectedWorkspaceReactUnsupported
              ? "17.0.0"
              : guardedReactVersion(framework.version)
          }
        : framework
    ),
    targets: {
      ...project.targets,
      browsers
    }
  };
}

export function routeCapabilities(input: RouteInput) {
  assertContract<RouteRequest>("route-request", input.request);
  assertContract<ProjectSnapshot>("project-snapshot", input.project);
  const workspace = selectedWorkspace(input.request);
  return routeCapabilitiesFinal({
    ...input,
    project: guardedProject(input.project, workspace)
  });
}
