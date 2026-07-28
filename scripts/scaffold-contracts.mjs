import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";

const payloadParts = await Promise.all(
  [1, 2, 3, 4].map((part) =>
    readFile(new URL(`./scaffold-payload-${part}.txt`, import.meta.url), "utf8")
  )
);
const files = JSON.parse(
  gunzipSync(Buffer.from(payloadParts.join(""), "base64")).toString("utf8")
);
const redPaths = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "eslint.config.js",
  "packages/contracts/package.json",
  "packages/contracts/tsconfig.json",
  "packages/contracts/tsconfig.build.json",
  "packages/contracts/test/unit/canonical-json.test.ts"
]);
const mode = process.argv[2] ?? "--full";

for (const [path, content] of Object.entries(files)) {
  if (mode === "--red" && !redPaths.has(path)) continue;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}
console.log(`Scaffolded ${mode === "--red" ? redPaths.size : Object.keys(files).length} file(s).`);
