import { createServer } from "node:http";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canonicalProtocolDigest,
  createDefaultSorenApplication
} from "@soren-sdk/application";
import { createRestHandler } from "@soren-sdk/protocol-server";

import { createSorenClient } from "../src/index.js";

const repoRoot = resolve(process.cwd(), "../..");

async function withHttpClient<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = createDefaultSorenApplication(repoRoot);
  const server = createServer(
    createRestHandler({ application: app, allowedProjectRoots: [repoRoot] })
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected TCP listener.");
  }
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
}

describe("Soren TypeScript SDK", () => {
  it("exposes equivalent in-process and HTTP client results", async () => {
    const app = createDefaultSorenApplication(repoRoot);
    const inProcess = createSorenClient({ transport: "in-process", application: app });
    const routeInput = { text: "animate a card" };
    const direct = await app.route({ request: routeInput });
    const sdk = await inProcess.routes.create(routeInput);
    const http = await withHttpClient(async (baseUrl) =>
      createSorenClient({ transport: "http", baseUrl }).routes.create(routeInput)
    );
    expect(canonicalProtocolDigest(direct)).toBe(canonicalProtocolDigest(sdk));
    expect(canonicalProtocolDigest(direct)).toBe(canonicalProtocolDigest(http));
  });

  it("uses the stable client shape", async () => {
    const client = createSorenClient({
      transport: "in-process",
      application: createDefaultSorenApplication(repoRoot)
    });
    await expect(client.catalog.list()).resolves.toHaveProperty("connectors");
    await expect(client.catalog.get("web-platform")).resolves.toHaveProperty(
      "connector.directoryId",
      "web-platform"
    );
    await expect(client.connectors.health("web-platform")).resolves.toHaveProperty(
      "health.connectorId",
      "web-platform"
    );
  });
});
