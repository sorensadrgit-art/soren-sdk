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
const MOTION_REACT_CAPABILITIES = new Set([
  "interaction.drag",
  "interaction.gesture",
  "motion.layout",
  "motion.presence",
  "motion.shared-layout",
  "motion.spring"
]);

function requiredMotionCapabilities(request: RouteRequest) {
  return request.capabilities.filter(
    (capability) =>
      capability.required && MOTION_REACT_CAPABILITIES.has(capability.id)
  );
}

function requestedMotionWorkspaces(request: RouteRequest): string[] {
  return [
    ...new Set(
      requiredMotionCapabilities(request)
        .map((capability) => capability.quality?.workspace)
        .filter(
          (workspace): workspace is string =>
            typeof workspace === "string" && workspace.trim().length > 0
        )
        .map((workspace) => workspace.trim())
    )
  ].sort();
}

function allMotionCapabilitiesHaveWorkspace(request: RouteRequest): boolean {
  const required = requiredMotionCapabilities(request);
  return (
    required.length > 0 &&
    required.every(
      (capability) =>
        typeof capability.quality?.workspace === "string" &&
        capability.quality.workspace.trim().length > 0
    )
  );
}

function selectedWorkspace(request: RouteRequest): string | null {
  const workspaces = requestedMotionWorkspaces(request);
  if (workspaces.length === 1) return workspaces[0] ?? null;
  return workspaces.length > 1 && allMotionCapabilitiesHaveWorkspace(request)
    ? workspaces[0] ?? null
    : null;
}

function workspaceExists(
  project: ProjectSnapshot,
  workspace: string | null
): boolean {
  return (
    workspace === null ||
    workspace === "." ||
    project.workspace.packages.some((item) => item.path === workspace)
  );
}

function normalizedWorkspace(workspace: string | null | undefined): string {
  return workspace ?? ".";
}

function isRootOrSelected(
  workspace: string | null | undefined,
  selected: string
): boolean {
  const normalized = normalizedWorkspace(workspace);
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

function reactSourcesForWorkspace(
  project: ProjectSnapshot,
  workspace: string
) {
  const all = [...project.dependencies, ...project.frameworks].filter(
    (item) => item.name === "react"
  );
  const local = all.filter(
    (item) => normalizedWorkspace(item.workspace) === workspace
  );
  return local.length > 0
    ? local
    : all.filter((item) => normalizedWorkspace(item.workspace) === ".");
}

function explicitMotionWorkspacesSupported(
  project: ProjectSnapshot,
  request: RouteRequest
): boolean {
  const workspaces = requestedMotionWorkspaces(request);
  if (workspaces.length < 2) return true;
  if (!allMotionCapabilitiesHaveWorkspace(request)) return false;
  return workspaces.every((workspace) => {
    if (!workspaceExists(project, workspace)) return false;
    const sources = reactSourcesForWorkspace(project, workspace);
    return (
      sources.length > 0 &&
      sources.every(
        (source) =>
          source.version !== null &&
          reactRangeGuaranteesMinimum(source.version)
      )
    );
  });
}

function forceUnsupportedReact(project: ProjectSnapshot): ProjectSnapshot {
  return {
    ...project,
    dependencies: project.dependencies.map((dependency) =>
      dependency.name === "react"
        ? { ...dependency, version: "17.0.0" }
        : dependency
    ),
    frameworks: project.frameworks.map((framework) =>
      framework.name === "react"
        ? { ...framework, version: "17.0.0" }
        : framework
    )
  };
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
  current: string | null | undefined,
  selected: string | null
): string {
  const normalized = normalizedWorkspace(current);
  return selected !== null && normalized === "." ? selected : normalized;
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
  const candidateDependencies =
    workspace === null
      ? project.dependencies
      : project.dependencies.filter((dependency) =>
          isRootOrSelected(dependency.workspace, workspace)
        );
  const candidateFrameworks =
    workspace === null
      ? project.frameworks
      : project.frameworks.filter((framework) =>
          isRootOrSelected(framework.workspace, workspace)
        );
  const hasWorkspaceLocalReact =
    workspace !== null &&
    [...candidateDependencies, ...candidateFrameworks].some(
      (item) =>
        item.name === "react" && normalizedWorkspace(item.workspace) === workspace
    );
  const dependencies = hasWorkspaceLocalReact
    ? candidateDependencies.filter(
        (dependency) =>
          dependency.name !== "react" ||
          normalizedWorkspace(dependency.workspace) === workspace
      )
    : candidateDependencies;
  const frameworks = hasWorkspaceLocalReact
    ? candidateFrameworks.filter(
        (framework) =>
          framework.name !== "react" ||
          normalizedWorkspace(framework.workspace) === workspace
      )
    : candidateFrameworks;
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
            workspace: routedReactWorkspace(dependency.workspace, workspace),
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
            workspace: routedReactWorkspace(framework.workspace, workspace),
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
  const requestedWorkspace = selectedWorkspace(input.request);
  const workspace = workspaceExists(input.project, requestedWorkspace)
    ? requestedWorkspace
    : null;
  const guarded = guardedProject(input.project, workspace);
  const project = explicitMotionWorkspacesSupported(input.project, input.request)
    ? guarded
    : forceUnsupportedReact(guarded);
  return routeCapabilitiesFinal({
    ...input,
    project
  });
}
