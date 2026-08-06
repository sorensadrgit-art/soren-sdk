import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "packages", "cli", "dist", "bin.js");
const fixture = join(root, "packages", "cli", "test", "fixtures", "config-project");

function run(...args) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`soren-sdk ${args.join(" ")} exited ${String(result.status)}\n${result.stderr}`);
  }
  return result.stdout;
}

const temporary = await mkdtemp(join(tmpdir(), "soren-sdk-cli-smoke-"));
try {
  run("catalog", "list");
  run("catalog", "get", "web-platform", "--json");
  run("connector", "health", "web-platform", "--json");
  run("inspect", fixture, "--json");
  run("config", "show", "--project", fixture, "--json");
  run("policy", "resolve", "--project", fixture, "--json");

  const routePlanPath = join(temporary, "route-plan.json");
  await writeFile(
    routePlanPath,
    run("route", "--project", fixture, "--capability", "platform.css-transition", "--json"),
    "utf8"
  );
  const lockPath = join(temporary, "soren-sdk.lock");
  run("lock", "create", "--project", fixture, "--route-plan", routePlanPath, "--output", lockPath, "--json");
  run("lock", "inspect", lockPath, "--json");
  run("lock", "check", lockPath, "--project", fixture, "--route-plan", routePlanPath, "--json");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
