import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCatalog, setRemoteInventory } from "@/lib/catalog";
import { parseInventoryDocs, refreshCatalog, setInventoryFetcher, sourceStatus } from "@/lib/inventory-source";

const base = {
  title: "Test Tee",
  role: "top",
  subtype: "tee",
  gender: "unisex",
  color: { name: "white", hex: "#ffffff" },
  styles: ["casual"],
  formality: 2,
  seasons: ["summer"],
  price_cents: 2500,
  currency: "USD",
  quantity: 4,
};

describe("firestore inventory source", () => {
  beforeEach(() => {
    process.env.INVENTORY_SOURCE = "firestore";
    process.env.INVENTORY_REFRESH_SECONDS = "0";
  });
  afterEach(() => {
    delete process.env.INVENTORY_SOURCE;
    delete process.env.INVENTORY_REFRESH_SECONDS;
    setInventoryFetcher(null);
    setRemoteInventory(null);
  });

  it("uses the doc id, forces source=inventory, converts Timestamps and rejects invalid docs", () => {
    const ts = { toDate: () => new Date("2026-09-01T00:00:00Z") };
    const { items, rejected } = parseInventoryDocs([
      { id: "tee-1", data: { ...base, source: "external", received_at: ts } },
      { id: "bad-1", data: { title: "no price" } },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "tee-1", source: "inventory", received_at: "2026-09-01T00:00:00.000Z" });
    expect(rejected.map((r) => r.id)).toEqual(["bad-1"]);
  });

  it("replaces the JSON inventory with the Firestore snapshot", async () => {
    setInventoryFetcher(async () => [{ id: "tee-1", data: { ...base } }]);
    await refreshCatalog(true);
    expect(loadCatalog().inventory.map((p) => p.id)).toEqual(["tee-1"]);
    expect(sourceStatus.source).toBe("firestore");
  });

  it("keeps the previous snapshot when a refresh fails", async () => {
    setInventoryFetcher(async () => [{ id: "tee-1", data: { ...base } }]);
    await refreshCatalog(true);
    setInventoryFetcher(async () => {
      throw new Error("offline");
    });
    await refreshCatalog(true);
    expect(loadCatalog().inventory.map((p) => p.id)).toEqual(["tee-1"]);
    expect(sourceStatus.error).toBe("offline");
  });

  it("falls back to inventory.json when the source is json", async () => {
    process.env.INVENTORY_SOURCE = "json";
    await refreshCatalog(true);
    expect(loadCatalog().inventory.length).toBeGreaterThan(5);
  });
});
