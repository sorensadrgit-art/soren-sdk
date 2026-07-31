import {
  assertContract,
  type ProjectSnapshot,
  type RouteRequest
} from "@soren-sdk/contracts";

import { routeCapabilities as routeCapabilitiesWorkspaceReuse } from "./route-capabilities-workspace-reuse.js";
import type { RouteInput } from "./types.js";

export function routeCapabilities(input: RouteInput) {
  assertContract<RouteRequest>("route-request", input.request);
  assertContract<ProjectSnapshot>("project-snapshot", input.project);
  return routeCapabilitiesWorkspaceReuse(input);
}
