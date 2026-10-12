import { describe, expect, it } from "vitest";
import { listingToProduct } from "@/lib/listing-adapter";
import { parseInventoryDocs } from "@/lib/inventory-source";

const base = {
  title: "Black Leather Chelsea Boots",
  description: "worn once",
  category: "Shoes",
  tags: ["boots", "black"],
  priceUsdc: "45.50",
  imageUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
  size: "10",
  status: "active",
  brand: "Acme",
  createdAt: { toDate: () => new Date("2026-09-01T00:00:00Z") },
};

describe("listing adapter", () => {
  it("maps an active listing to an inventory Product", () => {
    const r = listingToProduct("abc123", base);
    if (!("product" in r)) throw new Error("expected a product, got skip " + r.skip);
    expect(r.product).toMatchObject({
      id: "inv_abc123",
      source: "inventory",
      role: "shoes",
      price_cents: 4550,
      image_url: "https://example.com/a.jpg",
      sizes: ["10"],
      quantity: 1,
      brand: "Acme",
      sku: "abc123",
    });
  });

  it("skips drafts, missing prices/titles and items it cannot classify", () => {
    expect(listingToProduct("a", { ...base, status: "draft" })).toEqual({ skip: "not_active" });
    expect(listingToProduct("a", { ...base, priceUsdc: "" })).toEqual({ skip: "no_price" });
    expect(listingToProduct("a", { ...base, title: "" })).toEqual({ skip: "no_title" });
    expect(listingToProduct("a", { ...base, title: "Bluetooth Speaker", category: "Electronics", tags: [], description: "" })).toEqual({ skip: "no_role" });
  });

  it("is used by parseInventoryDocs in listings shape and reports skip reasons", () => {
    const { items, rejected } = parseInventoryDocs(
      [
        { id: "ok", data: base },
        { id: "draft", data: { ...base, status: "draft" } },
      ],
      "listings",
    );
    expect(items.map((p) => p.id)).toEqual(["inv_ok"]);
    expect(rejected).toEqual([{ id: "draft", error: "not_active" }]);
  });
});
