import {
  assertContract,
  type ProjectSnapshot,
  type RouteRequest
} from "@soren-sdk/contracts";

import { routeCapabilities as routeCapabilitiesFinal } from "./route-capabilities-final.js";
import type { RouteInput } from "./types.js";

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

function guardedProject(
  project: ProjectSnapshot,
  workspace: string | null
): ProjectSnapshot {
  const browsers = project.targets.browsers.filter(
    (target) => !/^\s*\[[^\]]+\]\s*$/.test(target)
  );

  return {
    ...project,
    dependencies:
      workspace === null
        ? project.dependencies
        : project.dependencies.filter((dependency) =>
            isRootOrSelected(dependency.workspace, workspace)
          ),
    frameworks:
      workspace === null
        ? project.frameworks
        : project.frameworks.filter((framework) =>
            isRootOrSelected(framework.workspace, workspace)
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
