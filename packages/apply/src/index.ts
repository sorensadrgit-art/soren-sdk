export * from "./approval-validation.js";
export * from "./apply-service.js";
export * from "./drift-checks.js";
export * from "./durable-recovery.js";
export * from "./ports-fakes.js";
export * from "./ports.js";
export * from "./types.js";

/**
 * Public apply exposure is disabled in Phase 9.
 */
export const APPLY_DISABLED = true as const;