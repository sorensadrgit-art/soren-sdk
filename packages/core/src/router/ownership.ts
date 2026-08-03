import type { RoutePlan, RouteRequest } from "@soren-sdk/contracts";

export interface CapabilityAssignment {
  capabilityId: string;
  providerId: string;
  native: boolean;
  integrationIds: string[];
  support: "primary" | "secondary" | "fallback";
  confidence: number;
  installed: boolean;
  preferredRank: number | null;
}

export interface OwnershipResolution {
  ownership: RoutePlan["ownership"];
  status: "ok" | "needs-input" | "blocked";
  constraints: RoutePlan["constraints"];
  requiredInput: string[];
}

export interface ResolveOwnershipInput {
  request: RouteRequest;
  assignments: CapabilityAssignment[];
}

interface OwnershipTemplate {
  domain: string;
  property: string;
  possibleProperties: readonly string[];
}

interface ResolvedOwnership {
  item: RoutePlan["ownership"][number];
  capabilityId: string;
  explicitScope: boolean;
  explicitProperty: boolean;
  possibleProperties: ReadonlySet<string>;
}

const DEFAULTS: Readonly<Record<string, OwnershipTemplate>> = {
  "platform.css-transition": {
    domain: "dom-style",
    property: "css-transition",
    possibleProperties: [
      "background",
      "border",
      "color",
      "filter",
      "opacity",
      "transform"
    ]
  },
  "platform.css-animation": {
    domain: "dom-animation",
    property: "css-animation",
    possibleProperties: ["filter", "layout", "opacity", "transform"]
  },
  "platform.waapi-animation": {
    domain: "dom-animation",
    property: "waapi-animation",
    possibleProperties: ["filter", "layout", "opacity", "transform"]
  },
  "motion.presence": {
    domain: "presence",
    property: "presence",
    possibleProperties: ["opacity", "transform"]
  },
  "motion.layout": {
    domain: "layout",
    property: "layout",
    possibleProperties: ["layout", "transform"]
  },
  "motion.shared-layout": {
    domain: "layout",
    property: "layout",
    possibleProperties: ["layout", "transform"]
  },
  "motion.spring": {
    domain: "timing",
    property: "timing",
    possibleProperties: ["timing"]
  },
  "interaction.drag": {
    domain: "gesture",
    property: "drag",
    possibleProperties: ["transform"]
  },
  "interaction.gesture": {
    domain: "gesture",
    property: "gesture",
    possibleProperties: ["gesture", "transform"]
  },
  "motion.timeline": {
    domain: "timeline",
    property: "timeline",
    possibleProperties: ["filter", "layout", "opacity", "transform"]
  },
  "motion.svg": {
    domain: "svg-animation",
    property: "svg",
    possibleProperties: ["opacity", "svg", "transform"]
  },
  "motion.flip": {
    domain: "layout",
    property: "layout",
    possibleProperties: ["layout", "transform"]
  },
  "scroll.triggered-animation": {
    domain: "scroll-trigger",
    property: "scroll",
    possibleProperties: ["opacity", "scroll", "transform"]
  },
  "scroll.pinned-sequence": {
    domain: "scroll-trigger",
    property: "scroll",
    possibleProperties: ["opacity", "scroll", "transform"]
  }
};

function stringQuality(
  request: RouteRequest,
  capabilityId: string,
  key: "scope" | "property"
): string | undefined {
  const capability = request.capabilities.find((item) => item.id === capabilityId);
  const value = capability?.quality?.[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function templateFor(capabilityId: string): OwnershipTemplate {
  return (
    DEFAULTS[capabilityId] ?? {
      domain: "capability",
      property: capabilityId,
      possibleProperties: [capabilityId]
    }
  );
}

function intersects(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function sortedOwnership(
  values: ResolvedOwnership[]
): RoutePlan["ownership"] {
  return values
    .map(({ item }) => item)
    .sort((left, right) =>
      [left.providerId, left.scope, left.domain, left.properties.join("\0")]
        .join("\0")
        .localeCompare(
          [
            right.providerId,
            right.scope,
            right.domain,
            right.properties.join("\0")
          ].join("\0")
        )
    );
}

export function resolveOwnership(
  input: ResolveOwnershipInput
): OwnershipResolution {
  const resolved: ResolvedOwnership[] = input.assignments.map((assignment) => {
    const template = templateFor(assignment.capabilityId);
    const explicitScope = stringQuality(
      input.request,
      assignment.capabilityId,
      "scope"
    );
    const explicitProperty = stringQuality(
      input.request,
      assignment.capabilityId,
      "property"
    );
    const property = explicitProperty ?? template.property;
    return {
      capabilityId: assignment.capabilityId,
      explicitScope: explicitScope !== undefined,
      explicitProperty: explicitProperty !== undefined,
      possibleProperties: new Set(
        explicitProperty === undefined
          ? template.possibleProperties
          : [explicitProperty]
      ),
      item: {
        providerId: assignment.providerId,
        domain: template.domain,
        scope: explicitScope ?? `capability:${assignment.capabilityId}`,
        properties: [property]
      }
    };
  });

  const constraints: RoutePlan["constraints"] = [];
  const requiredInput = new Set<string>();
  let blocked = false;
  let ambiguous = false;

  for (let leftIndex = 0; leftIndex < resolved.length; leftIndex += 1) {
    const left = resolved[leftIndex];
    if (left === undefined) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < resolved.length;
      rightIndex += 1
    ) {
      const right = resolved[rightIndex];
      if (right === undefined) continue;
      if (left.item.providerId === right.item.providerId) continue;
      if (left.item.scope !== right.item.scope) continue;

      const leftProperty = left.item.properties[0];
      const rightProperty = right.item.properties[0];
      if (
        left.explicitProperty &&
        right.explicitProperty &&
        leftProperty === rightProperty
      ) {
        blocked = true;
        constraints.push({
          code: "OWNERSHIP_CONFLICT",
          status: "failed",
          message: `${left.item.providerId} and ${right.item.providerId} both require exclusive ownership of ${left.item.scope}/${leftProperty}.`
        });
        continue;
      }

      if (
        (!left.explicitProperty || !right.explicitProperty) &&
        left.explicitScope &&
        right.explicitScope &&
        intersects(left.possibleProperties, right.possibleProperties)
      ) {
        ambiguous = true;
        constraints.push({
          code: "OWNERSHIP_AMBIGUOUS",
          status: "failed",
          message: `${left.item.providerId} and ${right.item.providerId} may overlap on scope ${left.item.scope}; explicit properties are required.`
        });
        requiredInput.add(
          `Specify non-overlapping properties for scope ${left.item.scope}.`
        );
      }
    }
  }

  constraints.sort((left, right) =>
    [left.code, left.message].join("\0").localeCompare(
      [right.code, right.message].join("\0")
    )
  );

  return {
    ownership: sortedOwnership(resolved),
    status: blocked ? "blocked" : ambiguous ? "needs-input" : "ok",
    constraints,
    requiredInput: [...requiredInput].sort()
  };
}
