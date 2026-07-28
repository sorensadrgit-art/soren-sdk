import { describe, expect, it, vi } from "vitest";

import { CatalogService, type CatalogReader } from "../src/index.js";

describe("CatalogService", () => {
  it("delegates connector lookups to the catalog reader", () => {
    const get = vi.fn().mockReturnValue(undefined);
    const reader: CatalogReader = {
      getCapabilityCatalog: vi.fn(),
      list: vi.fn(),
      get,
      health: vi.fn(),
      snapshot: vi.fn()
    };
    const service = new CatalogService(reader);

    expect(service.getConnector("motion")).toBeUndefined();
    expect(get).toHaveBeenCalledWith("motion");
  });
});
