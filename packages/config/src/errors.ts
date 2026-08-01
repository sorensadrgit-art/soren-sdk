export type ConfigParseErrorCode =
  | "CONFIG_PARSE"
  | "CONFIG_UNSAFE_KEY"
  | "CONFIG_DUPLICATE_KEY"
  | "CONFIG_ALIAS";

export class ConfigParseError extends Error {
  readonly code: ConfigParseErrorCode;
  readonly path: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ConfigParseErrorCode,
    message: string,
    path: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ConfigParseError";
    this.code = code;
    this.path = path;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

