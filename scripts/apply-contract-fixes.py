import json
from pathlib import Path


def patch_typescript_config() -> None:
    tsconfig = Path("tsconfig.json")
    config = json.loads(tsconfig.read_text())
    config["compilerOptions"]["esModuleInterop"] = True
    config["compilerOptions"]["allowSyntheticDefaultImports"] = True
    tsconfig.write_text(json.dumps(config, indent=2) + "\n")


def patch_validator() -> None:
    validator = Path("packages/contracts/src/validation/validator.ts")
    text = validator.read_text()
    old_imports = (
        'import Ajv2020, {\n'
        '  type AnySchemaObject,\n'
        '  type ErrorObject,\n'
        '  type ValidateFunction\n'
        '} from "ajv/dist/2020.js";\n'
        'import addFormats from "ajv-formats";'
    )
    new_imports = (
        'import { createRequire } from "node:module";\n'
        'import type {\n'
        '  AnySchemaObject,\n'
        '  ErrorObject,\n'
        '  ValidateFunction\n'
        '} from "ajv";\n\n'
        'interface AjvInstance {\n'
        '  readonly errors?: ErrorObject[] | null;\n'
        '  validateSchema(schema: AnySchemaObject): boolean;\n'
        '  compile(schema: AnySchemaObject): ValidateFunction;\n'
        '}\n\n'
        'type AjvConstructor = new (\n'
        '  options: Record<string, unknown>\n'
        ') => AjvInstance;\n'
        'type AddFormats = (ajv: AjvInstance) => unknown;\n\n'
        'const require = createRequire(import.meta.url);\n\n'
        'function loadDefaultOrModule<T>(moduleId: string): T {\n'
        '  const loaded = require(moduleId) as unknown;\n'
        '  if (\n'
        '    typeof loaded === "object" &&\n'
        '    loaded !== null &&\n'
        '    "default" in loaded\n'
        '  ) {\n'
        '    return (loaded as { default: T }).default;\n'
        '  }\n'
        '  return loaded as T;\n'
        '}\n\n'
        'const Ajv2020 = loadDefaultOrModule<AjvConstructor>("ajv/dist/2020");\n'
        'const addFormats = loadDefaultOrModule<AddFormats>("ajv-formats");'
    )
    if old_imports not in text:
        raise SystemExit("Expected Ajv import block was not found.")
    text = text.replace(old_imports, new_imports)
    text = text.replace(
        "  getContractValidator().assert<T>(name, value);",
        "  const validator: ContractValidator = getContractValidator();\n  validator.assert<T>(name, value);"
    )
    validator.write_text(text)


def patch_schema_registry() -> None:
    registry = Path("packages/contracts/src/schemas/registry.ts")
    text = registry.read_text()
    text = text.replace(
        'import { dirname, join, resolve } from "node:path";',
        'import { dirname, join } from "node:path";'
    )
    old_candidates = (
        'function candidateSchemaDirectories(): string[] {\n'
        '  const moduleDirectory = dirname(fileURLToPath(import.meta.url));\n\n'
        '  return [\n'
        '    join(moduleDirectory, "../schema-data"),\n'
        '    resolve(process.cwd(), "schemas")\n'
        '  ];\n'
        '}'
    )
    new_candidates = (
        'function workspaceSchemaCandidates(): string[] {\n'
        '  const candidates: string[] = [];\n'
        '  let current = process.cwd();\n\n'
        '  for (let depth = 0; depth < 6; depth += 1) {\n'
        '    candidates.push(join(current, "schemas"));\n'
        '    const parent = dirname(current);\n'
        '    if (parent === current) break;\n'
        '    current = parent;\n'
        '  }\n\n'
        '  return candidates;\n'
        '}\n\n'
        'function candidateSchemaDirectories(): string[] {\n'
        '  const moduleDirectory = dirname(fileURLToPath(import.meta.url));\n\n'
        '  return [\n'
        '    join(moduleDirectory, "../schema-data"),\n'
        '    ...workspaceSchemaCandidates()\n'
        '  ];\n'
        '}'
    )
    if old_candidates not in text:
        raise SystemExit("Expected schema candidate block was not found.")
    registry.write_text(text.replace(old_candidates, new_candidates))


SCHEMA_MAP_KEYWORDS = {
    "$defs",
    "definitions",
    "dependentSchemas",
    "patternProperties",
    "properties"
}
SCHEMA_SINGLE_KEYWORDS = {
    "additionalProperties",
    "contains",
    "contentSchema",
    "else",
    "if",
    "items",
    "not",
    "propertyNames",
    "then",
    "unevaluatedProperties"
}
SCHEMA_ARRAY_KEYWORDS = {"allOf", "anyOf", "oneOf", "prefixItems"}
OBJECT_TYPE_KEYWORDS = {
    "additionalProperties",
    "dependentRequired",
    "dependentSchemas",
    "maxProperties",
    "minProperties",
    "patternProperties",
    "properties",
    "propertyNames",
    "required",
    "unevaluatedProperties"
}
ARRAY_TYPE_KEYWORDS = {
    "contains",
    "items",
    "maxContains",
    "maxItems",
    "minContains",
    "minItems",
    "prefixItems",
    "uniqueItems"
}
STRING_TYPE_KEYWORDS = {
    "contentEncoding",
    "contentMediaType",
    "contentSchema",
    "format",
    "maxLength",
    "minLength",
    "pattern"
}
NUMBER_TYPE_KEYWORDS = {
    "exclusiveMaximum",
    "exclusiveMinimum",
    "maximum",
    "minimum",
    "multipleOf"
}


def add_local_required_properties(schema: dict) -> None:
    required_fields = schema.get("required")
    if not isinstance(required_fields, list):
        return
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        properties = {}
        schema["properties"] = properties
    for field in required_fields:
        if isinstance(field, str):
            properties.setdefault(field, {})


def infer_missing_type(schema: dict) -> None:
    if "type" in schema:
        return
    keys = set(schema)
    if keys & OBJECT_TYPE_KEYWORDS:
        schema["type"] = "object"
    elif keys & ARRAY_TYPE_KEYWORDS:
        schema["type"] = "array"
    elif keys & STRING_TYPE_KEYWORDS:
        schema["type"] = "string"
    elif keys & NUMBER_TYPE_KEYWORDS:
        schema["type"] = "number"


def normalize_strict_schema(schema: dict) -> None:
    add_local_required_properties(schema)
    infer_missing_type(schema)
    for keyword, value in list(schema.items()):
        if keyword in SCHEMA_MAP_KEYWORDS and isinstance(value, dict):
            for child_schema in value.values():
                if isinstance(child_schema, dict):
                    normalize_strict_schema(child_schema)
        elif keyword in SCHEMA_SINGLE_KEYWORDS and isinstance(value, dict):
            normalize_strict_schema(value)
        elif keyword in SCHEMA_ARRAY_KEYWORDS and isinstance(value, list):
            for child_schema in value:
                if isinstance(child_schema, dict):
                    normalize_strict_schema(child_schema)


def is_selectable_semantic_rule(rule: object) -> bool:
    if not isinstance(rule, dict):
        return False
    try:
        return (
            rule["if"]["properties"]["connector"]
            ["properties"]["selectable"]["const"] is True
        )
    except (KeyError, TypeError):
        return False


def remove_duplicate_semantic_rule(schema: dict) -> None:
    rules = schema.get("allOf")
    if not isinstance(rules, list):
        return
    remaining = [rule for rule in rules if not is_selectable_semantic_rule(rule)]
    if remaining:
        schema["allOf"] = remaining
    else:
        schema.pop("allOf", None)


def patch_schemas() -> None:
    for schema_directory in (
        Path("schemas"),
        Path("packages/contracts/src/schema-data")
    ):
        if not schema_directory.exists():
            continue
        for schema_path in schema_directory.glob("*.schema.json"):
            schema = json.loads(schema_path.read_text())
            if schema_path.name == "connector.schema.json":
                remove_duplicate_semantic_rule(schema)
            normalize_strict_schema(schema)
            schema_path.write_text(json.dumps(schema, indent=2) + "\n")


def main() -> None:
    patch_typescript_config()
    patch_validator()
    patch_schema_registry()
    patch_schemas()


if __name__ == "__main__":
    main()
