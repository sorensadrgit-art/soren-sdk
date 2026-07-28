import { createRequire } from "node:module";
import type {
  AnySchemaObject,
  ErrorObject,
  ValidateFunction
} from "ajv";

interface AjvInstance {
  readonly errors?: ErrorObject[] | null;
  validateSchema(schema: AnySchemaObject): boolean;
  compile(schema: AnySchemaObject): ValidateFunction;
}

type AjvConstructor = new (
  options: Record<string, unknown>
) => AjvInstance;
type AddFormats = (ajv: AjvInstance) => unknown;

const require = createRequire(import.meta.url);

function loadDefaultOrModule<T>(moduleId: string): T {
  const loaded = require(moduleId) as unknown;
  if (
    typeof loaded === "object" &&
    loaded !== null &&
    "default" in loaded
  ) {
    return (loaded as { default: T }).default;
  }
  return loaded as T;
}

const Ajv2020 = loadDefaultOrModule<AjvConstructor>("ajv/dist/2020");
const addFormats = loadDefaultOrModule<AddFormats>("ajv-formats");

import {
  ContractValidationError,
  type ContractIssue
} from "../errors/index.js";
import {
  loadAllSchemas,
  type ContractSchemaName
} from "../schemas/index.js";
import type {
  CapabilityCatalog,
  ConnectorManifest,
  JsonValue
} from "../types/index.js";
import {
  validateConnectorSemantics,
  type ConnectorSemanticOptions
} from "./semantic.js";

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export interface ValidationFailure {
  ok: false;
  issues: readonly ContractIssue[];
}

export type ValidationResult<T> = ValidationFailure | ValidationSuccess<T>;

function normalizeParams(params: Record<string, unknown>): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      value === undefined ? null : (value as JsonValue)
    ])
  );
}

function normalizeAjvError(error: ErrorObject): ContractIssue {
  return {
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? "Schema validation failed.",
    params: normalizeParams(error.params)
  };
}

export class ContractValidator {
  readonly #validators = new Map<ContractSchemaName, ValidateFunction>();

  constructor() {
    const ajv = new Ajv2020({
      allErrors: true,
      allowUnionTypes: true,
      strict: true,
      validateFormats: true
    });
    addFormats(ajv);

    for (const [name, schema] of loadAllSchemas()) {
      const validSchema = ajv.validateSchema(schema as AnySchemaObject);
      if (!validSchema) {
        const details = ajv.errors?.map(normalizeAjvError) ?? [];
        throw new ContractValidationError(
          `Schema "${name}" is invalid.`,
          details
        );
      }
      this.#validators.set(name, ajv.compile(schema as AnySchemaObject));
    }
  }

  validate<T>(name: ContractSchemaName, value: unknown): ValidationResult<T> {
    const validator = this.#validators.get(name);
    if (validator === undefined) {
      throw new Error(`No validator registered for schema "${name}".`);
    }

    if (validator(value)) {
      return { ok: true, value: value as T };
    }

    return {
      ok: false,
      issues: validator.errors?.map(normalizeAjvError) ?? []
    };
  }

  assert<T>(name: ContractSchemaName, value: unknown): asserts value is T {
    const result = this.validate<T>(name, value);
    if (!result.ok) {
      throw new ContractValidationError(
        `Value does not satisfy the "${name}" contract.`,
        result.issues
      );
    }
  }
}

let defaultValidator: ContractValidator | undefined;

export function getContractValidator(): ContractValidator {
  defaultValidator ??= new ContractValidator();
  return defaultValidator;
}

export function validateContract<T>(
  name: ContractSchemaName,
  value: unknown
): ValidationResult<T> {
  return getContractValidator().validate<T>(name, value);
}

export function assertContract<T>(
  name: ContractSchemaName,
  value: unknown
): asserts value is T {
  const validator: ContractValidator = getContractValidator();
  validator.assert<T>(name, value);
}

export function validateConnectorManifest(
  value: unknown,
  options: ConnectorSemanticOptions = {}
): ValidationResult<ConnectorManifest> {
  const schemaResult = validateContract<ConnectorManifest>("connector", value);
  if (!schemaResult.ok) {
    return schemaResult;
  }

  const issues = validateConnectorSemantics(schemaResult.value, options);
  return issues.length === 0
    ? schemaResult
    : { ok: false, issues };
}

export function validateCapabilityCatalog(
  value: unknown
): ValidationResult<CapabilityCatalog> {
  return validateContract<CapabilityCatalog>("capability-catalog", value);
}
