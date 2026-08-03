export type VersionTuple = readonly [number, number, number];

function stripKnownPrefix(value: string): string {
  let result = value.trim();
  if (result.startsWith("workspace:")) {
    result = result.slice("workspace:".length);
  }
  if (result.startsWith("npm:")) {
    const at = result.lastIndexOf("@");
    if (at <= "npm:".length) return "";
    result = result.slice(at + 1);
  }
  return result.trim();
}

export function minimumDeclaredVersion(value: string): VersionTuple | null {
  let source = stripKnownPrefix(value);
  if (source === "" || /\|\||\s+-\s+|[*xX]|latest|next/i.test(source)) {
    return null;
  }
  if (/^[<>](?![=])/.test(source) || source.startsWith("<=")) return null;
  source = source.replace(/^(?:\^|~|>=)\s*/, "");
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-[0-9A-Za-z.-]+)?$/.exec(
    source
  );
  if (match === null) return null;
  return [
    Number(match[1]),
    Number(match[2] ?? 0),
    Number(match[3] ?? 0)
  ];
}

function compare(left: VersionTuple, right: VersionTuple): number {
  if (left[0] !== right[0]) return left[0] - right[0];
  if (left[1] !== right[1]) return left[1] - right[1];
  return left[2] - right[2];
}

export function isAtLeast(
  value: string,
  minimum: VersionTuple
): boolean | null {
  const declared = minimumDeclaredVersion(value);
  return declared === null ? null : compare(declared, minimum) >= 0;
}
