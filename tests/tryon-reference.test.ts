import { describe, expect, it, vi } from "vitest";
import { prepareTryOnReferences } from "@/lib/tryon-reference";
import { toProduct } from "@/lib/importing";

const product = toProduct({ title: "Silk Slip Dress", price_cents: 6000, image_url: "/products/dress.jpg" }, "inventory")!;

describe("try-on product references", () => {
  it("uses the actual product photo instead of a generated stand-in", async () => {
    const photo = vi.fn().mockResolvedValue("photo-data");
    const render = vi.fn().mockResolvedValue("render-data");
    expect(await prepareTryOnReferences([product], photo, render)).toEqual([
      { title: product.title, role: "dress", image: "photo-data", reference: "product-photo" },
    ]);
    expect(photo).toHaveBeenCalledWith(product.image_url);
    expect(render).not.toHaveBeenCalled();
  });

  it("does not substitute a representative stock photo for the actual SKU", async () => {
    const photo = vi.fn();
    const result = await prepareTryOnReferences([{ ...product, image_credit: { text: "Representative", license: "cc0" } }], photo, async () => "render");
    expect(result[0].reference).toBe("approximation");
    expect(photo).not.toHaveBeenCalled();
  });

  it("reports unreadable product photos rather than silently inventing the item", async () => {
    await expect(prepareTryOnReferences([product], async () => { throw new Error("CORS"); }, async () => "render")).rejects.toThrow("product photo");
  });

  it("rejects empty outfits and more than six items before preparing images", async () => {
    const photo = vi.fn();
    const render = vi.fn();
    await expect(prepareTryOnReferences([], photo, render)).rejects.toThrow();
    await expect(prepareTryOnReferences(Array(7).fill(product), photo, render)).rejects.toThrow();
    expect(photo).not.toHaveBeenCalled();
  });
});
