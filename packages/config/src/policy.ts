import { digestJson } from "@soren-sdk/contracts";
import type { Digest, JsonValue, PolicyDocument } from "@soren-sdk/contracts";
import type { FileSystemAdapter } from "./adapters/filesystem.js";
import { ConfigurationReader } from "./configuration.js";

export type PolicyScope =
  | "builtin"
  | "organization"
  | "workspace"
  | "project"
  | "run";

export type PolicyResolutionErrorCode =
  | "POLICY_WEAKENING_DENIED"
  | "POLICY_INVALID";

export class PolicyResolutionError extends Error {
  readonly code: PolicyResolutionErrorCode;
  readonly field: string;
  readonly layer: PolicyScope;
  readonly value: unknown;

  constructor(
    code: PolicyResolutionErrorCode,
    field: string,
    message: string,
    layer: PolicyScope,
    value: unknown
  ) {
    super(message);
    this.name = "PolicyResolutionError";
    this.code = code;
    this.field = field;
    this.layer = layer;
    this.value = value;
  }
}

export interface ResolvePolicyInput {
  projectRoot: string;
  fs: FileSystemAdapter;
  organizationPolicy?: PolicyDocument;
  runPolicy?: PolicyDocument;
  workspaceRoot?: string;
}

export interface PolicyDecision {
  field: string;
  value: boolean | number | string | string[];
  reasonCode: string;
  layer: PolicyScope;
  sourcePolicyId: string | null;
  inheritedDeny: boolean;
}

export interface ResolvedPolicy {
  snapshotId: Digest;
  document: PolicyDocument;
  effective: PolicyDocument["rules"];
  decisions: PolicyDecision[];
  layers: Array<{
    scope: PolicyScope;
    policyId: string | null;
    source: string | null;
  }>;
}

/**
 * Provider-neutral hard-safety baseline. Empty allowlists mean "no allow
 * constraint at this layer"; the resolver falls back to deny-by-default at the
 * end. Network is locked to `deny` under tighten-only resolution.
 */
export const BUILTIN_POLICY: PolicyDocument = {
  schemaVersion: "1.0.0-draft.1",
  contractKind: "policy",
  policyId: "builtin-hard-safety",
  version: "1.0.0",
  scope: "builtin",
  rules: {
    allowedConnectors: [],
    deniedConnectors: [],
    allowExperimental: false,
    allowedLicenses: [],
    allowPaidServices: false,
    network: { mode: "deny", allowedHosts: [] },
    filesystem: { read: [], write: [] },
    allowRemoteProjectContent: false,
    maxBundleKilobytes: null,
    requireReducedMotion: true,
    requiredApprovals: [],
  },
};

const NETWORK_MODE_RANK: Record<
  PolicyDocument["rules"]["network"]["mode"],
  number
> = {
  unrestricted: 0,
  allowlist: 1,
  deny: 2,
};

type NetworkMode = PolicyDocument["rules"]["network"]["mode"];

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function jsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function sourceReasonCode(scope: PolicyScope): string {
  if (scope === "organization") {
    return "POLICY_SOURCE_ORG";
  }
  return `POLICY_SOURCE_${scope.toUpperCase()}`;
}

function policyIdOf(document: PolicyDocument): string | null {
  return document.scope === "builtin" ? null : document.policyId;
}

/** Type-erased assignment helpers for fold state (list / boolean fields). */
function setStateList(
  state: FoldState,
  key: keyof FoldState,
  value: string[] | null
): void {
  (state as unknown as Record<string, string[] | null>)[key] = value;
}

function setStateBool(state: FoldState, key: keyof FoldState, value: boolean): void {
  (state as unknown as Record<string, boolean>)[key] = value;
}

interface FoldState {
  allowedConnectors: string[] | null;
  deniedConnectors: string[];
  allowedLicenses: string[] | null;
  allowExperimental: boolean;
  allowPaidServices: boolean;
  networkMode: NetworkMode;
  allowedHosts: string[] | null;
  filesystemRead: string[] | null;
  filesystemWrite: string[] | null;
  allowRemoteProjectContent: boolean;
  maxBundleKilobytes: number | null;
  requireReducedMotion: boolean;
  requiredApprovals: string[];
}

interface LayerEntry {
  scope: PolicyScope;
  document: PolicyDocument;
  source: string | null;
}

type DecisionSink = (decision: PolicyDecision) => void;

function weaken(
  field: string,
  layer: PolicyScope,
  value: unknown,
  message: string
): PolicyResolutionError {
  return new PolicyResolutionError(
    "POLICY_WEAKENING_DENIED",
    field,
    message,
    layer,
    value
  );
}

/** Fold an allowlist-style constraint (empty = no constraint at this layer). */
function foldAllowlist(
  state: FoldState,
  record: DecisionSink,
  layer: LayerEntry,
  field: string,
  stateKey: keyof FoldState,
  layerValue: string[],
  denyChecked: boolean
): void {
  if (layerValue.length === 0) {
    return;
  }
  if (denyChecked) {
    for (const item of layerValue) {
      if (state.deniedConnectors.includes(item)) {
        throw weaken(
          field,
          layer.scope,
          item,
          `layer ${layer.scope} re-allows "${item}" which is denied by a lower layer`
        );
      }
    }
  }
  const current = state[stateKey] as string[] | null;
  if (current === null) {
    const value = stableUnique(layerValue);
    setStateList(state, stateKey, value);
    record({
      field,
      value,
      reasonCode: sourceReasonCode(layer.scope),
      layer: layer.scope,
      sourcePolicyId: policyIdOf(layer.document),
      inheritedDeny: false,
    });
    return;
  }
  for (const item of layerValue) {
    if (!current.includes(item)) {
      throw weaken(
        field,
        layer.scope,
        item,
        `layer ${layer.scope} adds "${item}" which is not present in the inherited ${field} allowlist`
      );
    }
  }
  const narrowed = stableUnique(layerValue);
  if (narrowed.length !== current.length || narrowed.some((v, i) => v !== current[i])) {
    setStateList(state, stateKey, narrowed);
    record({
      field,
      value: narrowed,
      reasonCode: "POLICY_TIGHTEN",
      layer: layer.scope,
      sourcePolicyId: policyIdOf(layer.document),
      inheritedDeny: false,
    });
  }
}

/** Fold a boolean that may only tighten in one direction. */
function foldBool(
  state: FoldState,
  record: DecisionSink,
  layer: LayerEntry,
  field: keyof FoldState,
  layerValue: boolean,
  tightenValue: boolean
): void {
  const current = state[field] as boolean;
  if (layerValue === current) {
    return;
  }
  if (layerValue === tightenValue) {
    throw weaken(
      field,
      layer.scope,
      layerValue,
      `layer ${layer.scope} attempts to loosen "${field}" away from its constrained value`
    );
  }
  setStateBool(state, field, layerValue);
  record({
    field,
    value: layerValue,
    reasonCode: "POLICY_TIGHTEN",
    layer: layer.scope,
    sourcePolicyId: policyIdOf(layer.document),
    inheritedDeny: false,
  });
}

/**
 * Layered, tighten-only policy resolver. Resolution order is builtin →
 * organization → workspace → project → run; each higher layer may only
 * restrict the inherited posture, never loosen it.
 */
export class PolicyResolver {
  resolve(input: ResolvePolicyInput): ResolvedPolicy {
    const reader = new ConfigurationReader({
      fs: input.fs,
      ...(input.workspaceRoot !== undefined
        ? { workspaceRoot: input.workspaceRoot }
        : {}),
    });
    const discovered = reader.loadPolicyLayers(input.projectRoot);

    const layers: LayerEntry[] = [
      { scope: "builtin", document: BUILTIN_POLICY, source: null },
    ];
    if (input.organizationPolicy !== undefined) {
      layers.push({
        scope: "organization",
        document: input.organizationPolicy,
        source: null,
      });
    }
    for (const layer of discovered) {
      layers.push({
        scope: layer.source.scope,
        document: layer.document,
        source: layer.source.path,
      });
    }
    if (input.runPolicy !== undefined) {
      layers.push({
        scope: "run",
        document: input.runPolicy,
        source: null,
      });
    }

    const decisions: PolicyDecision[] = [];
    const record: DecisionSink = (decision) => {
      decisions.push(decision);
    };

    const state: FoldState = {
      allowedConnectors: null,
      deniedConnectors: [],
      allowedLicenses: null,
      allowExperimental: BUILTIN_POLICY.rules.allowExperimental,
      allowPaidServices: BUILTIN_POLICY.rules.allowPaidServices,
      networkMode: BUILTIN_POLICY.rules.network.mode,
      allowedHosts: null,
      filesystemRead: null,
      filesystemWrite: null,
      allowRemoteProjectContent:
        BUILTIN_POLICY.rules.allowRemoteProjectContent,
      maxBundleKilobytes: BUILTIN_POLICY.rules.maxBundleKilobytes ?? null,
      requireReducedMotion: BUILTIN_POLICY.rules.requireReducedMotion,
      requiredApprovals: [],
    };

    // Baseline source decisions for the builtin-locked booleans and mode.
    const baseline: Array<{ field: keyof FoldState; value: boolean | string }> = [
      { field: "allowExperimental", value: state.allowExperimental },
      { field: "allowPaidServices", value: state.allowPaidServices },
      { field: "allowRemoteProjectContent", value: state.allowRemoteProjectContent },
      { field: "requireReducedMotion", value: state.requireReducedMotion },
      { field: "networkMode", value: state.networkMode },
    ];
    for (const entry of baseline) {
      record({
        field: entry.field,
        value: entry.value,
        reasonCode: "POLICY_SOURCE_BUILTIN",
        layer: "builtin",
        sourcePolicyId: null,
        inheritedDeny: false,
      });
    }

    for (const layer of layers) {
      if (layer.scope === "builtin") {
        continue;
      }
      const rules = layer.document.rules;
      foldAllowlist(state, record, layer, "allowedConnectors", "allowedConnectors", rules.allowedConnectors, true);
      for (const denied of rules.deniedConnectors) {
        if (!state.deniedConnectors.includes(denied)) {
          state.deniedConnectors.push(denied);
        }
      }
      foldAllowlist(state, record, layer, "allowedLicenses", "allowedLicenses", rules.allowedLicenses, false);
      foldBool(state, record, layer, "allowExperimental", rules.allowExperimental, true);
      foldBool(state, record, layer, "allowPaidServices", rules.allowPaidServices, true);
      foldBool(
        state,
        record,
        layer,
        "allowRemoteProjectContent",
        rules.allowRemoteProjectContent,
        true
      );
      this.#foldNetworkMode(state, record, layer, rules);
      this.#foldAllowedHosts(state, record, layer, rules);
      this.#foldFilesystemRead(state, record, layer, rules);
      this.#foldFilesystemWrite(state, record, layer, rules);
      this.#foldMaxBundle(state, record, layer, rules);
      this.#foldRequiredApprovals(state, record, layer, rules);
      this.#foldRequireReducedMotion(state, record, layer, rules);
    }

    // Deny union wins: strip denied connectors from the effective allowlist.
    let effectiveAllowedConnectors: string[] = state.allowedConnectors ?? [];
    if (state.deniedConnectors.length > 0) {
      const stripped = effectiveAllowedConnectors.filter(
        (connector) => !state.deniedConnectors.includes(connector)
      );
      if (stripped.length !== effectiveAllowedConnectors.length) {
        effectiveAllowedConnectors = stripped;
        record({
          field: "allowedConnectors",
          value: stripped,
          reasonCode: "POLICY_DENY_INHERITED",
          layer: "run",
          sourcePolicyId: null,
          inheritedDeny: true,
        });
      }
    }

    const effective: PolicyDocument["rules"] = {
      allowedConnectors: effectiveAllowedConnectors,
      deniedConnectors: stableUnique(state.deniedConnectors),
      allowExperimental: state.allowExperimental,
      allowedLicenses: state.allowedLicenses ?? [],
      allowPaidServices: state.allowPaidServices,
      network: {
        mode: state.networkMode,
        allowedHosts: state.allowedHosts ?? [],
      },
      filesystem: {
        read: state.filesystemRead ?? [],
        write: state.filesystemWrite ?? [],
      },
      allowRemoteProjectContent: state.allowRemoteProjectContent,
      maxBundleKilobytes: state.maxBundleKilobytes,
      requireReducedMotion: state.requireReducedMotion,
      requiredApprovals: stableUnique(state.requiredApprovals) as PolicyDocument["rules"]["requiredApprovals"],
    };

    const placeholder: PolicyDocument = {
      schemaVersion: "1.0.0-draft.1",
      contractKind: "policy",
      policyId: "resolved",
      version: "1.0.0",
      scope: "run",
      rules: effective,
    };
    const placeholderDigest = digestJson(jsonValue(placeholder));
    const document: PolicyDocument = {
      ...placeholder,
      policyId: `resolved-${placeholderDigest.slice(7, 15)}`,
    };

    return {
      snapshotId: digestJson(jsonValue(document)),
      document,
      effective,
      decisions,
      layers: layers.map((layer) => ({
        scope: layer.scope,
        policyId: policyIdOf(layer.document),
        source: layer.source,
      })),
    };
  }

  #foldNetworkMode(
    state: FoldState,
    record: DecisionSink,
    layer: LayerEntry,
    rules: PolicyDocument["rules"]
  ): void {
    const currentRank = NETWORK_MODE_RANK[state.networkMode];
    const layerRank = NETWORK_MODE_RANK[rules.network.mode];
    if (layerRank < currentRank) {
      throw weaken(
        "network.mode",
        layer.scope,
        rules.network.mode,
        `layer ${layer.scope} attempts to loosen network mode from "${state.networkMode}" to "${rules.network.mode}"`
      );
    }
    if (layerRank > currentRank) {
      state.networkMode = rules.network.mode;
      record({
        field: "network.mode",
        value: rules.network.mode,
        reasonCode: "POLICY_TIGHTEN",
        layer: layer.scope,
        sourcePolicyId: policyIdOf(layer.document),
        inheritedDeny: false,
      });
    }
  }

  #foldAllowedHosts(
    state: FoldState,
    record: DecisionSink,
    layer: LayerEntry,
    rules: PolicyDocument["rules"]
  ): void {
    const { mode, allowedHosts } = rules.network;
    if (allowedHosts.length > 0 && mode !== "allowlist") {
      throw new PolicyResolutionError(
        "POLICY_INVALID",
        "network.allowedHosts",
        `layer ${layer.scope} lists allowedHosts while network mode is "${mode}"; allowedHosts requires allowlist mode`,
        layer.scope,
        allowedHosts
      );
    }
    foldAllowlist(state, record, layer, "network.allowedHosts", "allowedHosts", allowedHosts, false);
  }

  #foldFilesystemRead(
    state: FoldState,
    record: DecisionSink,
    layer: LayerEntry,
    rules: PolicyDocument["rules"]
  ): void {
    foldAllowlist(state, record, layer, "filesystem.read", "filesystemRead", rules.filesystem.read, false);
  }

  #foldFilesystemWrite(
    state: FoldState,
    record: DecisionSink,
    layer: LayerEntry,
    rules: PolicyDocument["rules"]
  ): void {
    foldAllowlist(state, record, layer, "filesystem.write", "filesystemWrite", rules.filesystem.write, false);
  }

  #foldMaxBundle(
    state: FoldState,
    record: DecisionSink,
    layer: LayerEntry,
    rules: PolicyDocument["rules"]
  ): void {
    const current = state.maxBundleKilobytes;
    const value = rules.maxBundleKilobytes ?? null;
    if (value === current) {
      return;
    }
    if (current !== null && (value === null || value > current)) {
      throw weaken(
        "maxBundleKilobytes",
        layer.scope,
        value,
        `layer ${layer.scope} attempts to increase maxBundleKilobytes from ${current} to ${String(value)}`
      );
    }
    state.maxBundleKilobytes = value;
    record({
      field: "maxBundleKilobytes",
      value: value ?? 0,
      reasonCode: "POLICY_TIGHTEN",
      layer: layer.scope,
      sourcePolicyId: policyIdOf(layer.document),
      inheritedDeny: false,
    });
  }

  #foldRequiredApprovals(
    state: FoldState,
    record: DecisionSink,
    layer: LayerEntry,
    rules: PolicyDocument["rules"]
  ): void {
    const before = state.requiredApprovals.length;
    for (const approval of rules.requiredApprovals) {
      if (!state.requiredApprovals.includes(approval)) {
        state.requiredApprovals.push(approval);
      }
    }
    if (state.requiredApprovals.length > before) {
      record({
        field: "requiredApprovals",
        value: stableUnique(state.requiredApprovals),
        reasonCode: "POLICY_TIGHTEN",
        layer: layer.scope,
        sourcePolicyId: policyIdOf(layer.document),
        inheritedDeny: false,
      });
    }
  }

  #foldRequireReducedMotion(
    state: FoldState,
    record: DecisionSink,
    layer: LayerEntry,
    rules: PolicyDocument["rules"]
  ): void {
    foldBool(
      state,
      record,
      layer,
      "requireReducedMotion",
      rules.requireReducedMotion,
      false
    );
  }
}

export type PolicyResolverPort = Pick<PolicyResolver, "resolve">;
