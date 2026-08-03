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
export type ConfigLoadErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_AMBIGUOUS"
  | "CONFIG_INVALID";

export class ConfigLoadError extends Error {
  readonly code: ConfigLoadErrorCode;
  readonly path: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ConfigLoadErrorCode,
    message: string,
    path: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ConfigLoadError";
    this.code = code;
    this.path = path;
    if (details !== undefined) {
      this.details = details;
    }
  }
}
