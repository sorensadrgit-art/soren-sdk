import {
  digestJson,
  type Digest,
  type EvidenceCheck,
  type EvidenceEnvelope,
  type JsonValue,
  type VerificationState
} from "@soren-sdk/contracts";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SECRET = /(api[_-]?key|password|secret|token|private[_-]?key)/i;

export const VERIFICATION_STATES: VerificationState[] = [
  "passed",
  "failed",
  "not-run",
  "not-required",
  "blocked",
  "cancelled",
  "timed-out",
  "unverified"
];

export function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

export function evidenceIdFromDigest(digest: Digest): string {
  return `evidence_${digest.slice("sha256:".length, "sha256:".length + 24)}`;
}

export function hasDuplicateIds(items: readonly { id: string }[]): boolean {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) return true;
    ids.add(item.id);
  }
  return false;
}

export function normalizeChecks(checks: readonly EvidenceCheck[]): EvidenceCheck[] {
  return [...checks]
    .map((check) => ({
      id: check.id,
      required: check.required,
      status: check.status,
      diagnostics: [...check.diagnostics]
        .map((diagnostic) => ({ ...diagnostic }))
        .sort((left, right) =>
          left.code.localeCompare(right.code) || left.message.localeCompare(right.message)
        ),
      artifacts: [...check.artifacts].sort()
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function deriveUnverified(checks: readonly EvidenceCheck[]): string[] {
  return checks
    .filter((check) => check.required && check.status !== "passed" && check.status !== "not-required")
    .map((check) => check.id)
    .sort();
}

export function evidencePreimage(evidence: Pick<
  EvidenceEnvelope,
  "projectSnapshot" | "catalogSnapshot" | "policySnapshot" | "routePlan" | "executionPlan" | "checks" | "unverified"
>): JsonValue {
  return {
    projectSnapshot: evidence.projectSnapshot,
    catalogSnapshot: evidence.catalogSnapshot,
    policySnapshot: evidence.policySnapshot,
    routePlan: { ...evidence.routePlan },
    executionPlan: { ...evidence.executionPlan },
    checks: normalizeChecks(evidence.checks).map((check) => ({
      id: check.id,
      required: check.required,
      status: check.status,
      diagnostics: check.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message
      })),
      artifacts: [...check.artifacts]
    })),
    unverified: [...evidence.unverified].sort()
  };
}

export function digestEvidence(evidence: Pick<
  EvidenceEnvelope,
  "projectSnapshot" | "catalogSnapshot" | "policySnapshot" | "routePlan" | "executionPlan" | "checks" | "unverified"
>): Digest {
  return digestJson(evidencePreimage(evidence));
}

function invalidJson(path: string): never {
  throw new TypeError(`Value at ${path} is not valid JSON.`);
}

export function assertNoSecrets(value: unknown, path: string, seen = new WeakSet<object>()): void {
  if (typeof value === "string" && SECRET.test(value)) {
    throw new Error(`Secret-like data is forbidden at ${path}.`);
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable) continue;
    if (SECRET.test(key)) throw new Error(`Secret-like field is forbidden at ${path}.${key}.`);
    if ("value" in descriptor) assertNoSecrets(descriptor.value, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

export function copyJsonValue(value: unknown, path: string, seen = new WeakSet<object>()): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalidJson(path);
    return value;
  }
  if (typeof value !== "object" || seen.has(value)) invalidJson(path);
  seen.add(value);
  if (Array.isArray(value)) {
    const output: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor)) invalidJson(`${path}[${index}]`);
      output.push(copyJsonValue(descriptor.value, `${path}[${index}]`, seen));
    }
    if (Object.keys(value).some((key) => !/^(0|[1-9][0-9]*)$/u.test(key))) invalidJson(path);
    seen.delete(value);
    return output;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalidJson(path);
  const output: Record<string, JsonValue> = Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable) continue;
    if (DANGEROUS_KEYS.has(key) || !("value" in descriptor)) invalidJson(`${path}.${key}`);
    output[key] = copyJsonValue(descriptor.value, `${path}.${key}`, seen);
  }
  seen.delete(value);
  return output;
}
