import { readFileSync, writeFileSync } from "node:fs";

const path = "packages/core/src/context-gateway.ts";
const source = readFileSync(path, "utf8");
const before = "  return sorted(new Set(toolIds), (left, right) => left.localeCompare(right));";
const after = "  return sorted([...new Set(toolIds)], (left, right) => left.localeCompare(right));";
if (!source.includes(before)) {
  throw new Error("Expected Phase 7 normalization line was not found.");
}
const updated = source.replace(before, after);
if (updated === source || updated.includes(before)) {
  throw new Error("Phase 7 normalization type patch did not apply exactly once.");
}
writeFileSync(path, updated);
