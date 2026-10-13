import { describe, expect, it } from "vitest";
import { buildSections } from "@/components/store3d/layout";
import { toProduct } from "@/lib/importing";

const titles = ["Black Boots", "Cotton T-Shirt", "Blue Jeans", "Silk Dress", "Wool Coat", "Canvas Tote Bag", "Leather Belt"];
const stock = titles.map((title, i) => toProduct({ id: `p${i}`, title, quantity: 1, price_cents: 1000 }, "inventory")!);

describe("full inventory browsing", () => {
  it("provides a separate section for all seven stocked roles", () => {
    const sections = buildSections(stock, []);
    expect(sections.filter((s) => s.id !== "fitting")).toHaveLength(7);
    expect(new Set(sections.map((s) => s.center.join(","))).size).toBe(sections.length);
  });

  it("retains products beyond fixture capacity and can bring a selected one onto the rack", () => {
    const products = Array.from({ length: 50 }, (_, i) => ({ ...stock[1], id: `shirt-${i}` }));
    const section = buildSections(products, [], 3, ["shirt-49"]).find((s) => s.id === "own-top")!;
    expect(section.products).toHaveLength(50);
    expect(section.items.length).toBeLessThan(50);
    expect(section.items[0].product.id).toBe("shirt-49");
  });
});
