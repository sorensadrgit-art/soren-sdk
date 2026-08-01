export class ConfigParseError extends Error {
  readonly code: "CONFIG_PARSE" | "CONFIG_UNSAFE_KEY" | "CONFIG_DUPLICATE_KEY" | "CONFIG_ALIAS";
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;

  constructor(
    code: "CONFIG_PARSE" | "CONFIG_UNSAFE_KEY" | "CONFIG_DUPLICATE_KEY" | "CONFIG_ALIAS",
    message: string,
    options?: {
      path?: string;
      line?: number;
      column?: number;
    }
  ) {
    super(message);
    this.name = "ConfigParseError";
    this.code = code;
    if (options?.path !== undefined) {
      this.path = options.path;
    }
    if (options?.line !== undefined) {
      this.line = options.line;
    }
    if (options?.column !== undefined) {
      this.column = options.column;
    }
  }
}
