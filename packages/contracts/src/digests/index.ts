import { createHash } from "node:crypto";

import { canonicalJson } from "../canonical-json/index.js";
import type { Digest, JsonValue } from "../types/index.js";

export function sha256Bytes(value: string | Uint8Array): Digest {
  const hash = createHash("sha256").update(value).digest("hex");
  return `sha256:${hash}`;
}

export function digestJson(value: JsonValue): Digest {
  return sha256Bytes(canonicalJson(value));
}
