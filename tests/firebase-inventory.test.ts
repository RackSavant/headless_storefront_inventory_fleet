import { describe, expect, it } from "vitest";
import { listingToProduct, decodeFirestore } from "@/lib/firebase-inventory";

const listing = {
  title: "Black Leather Ankle Boots", category: "Shoes", status: "active", priceUsdc: "45.50",
  imageUrls: ["https://firebasestorage.googleapis.com/v0/b/example/o/boots.jpg?alt=media"],
  variants: [{ size: "38", color: "Black", quantity: 2 }, { size: "39", color: "Black", quantity: 0 }],
};

describe("Firebase inventory adapter", () => {
  it("preserves photos, USDC, available sizes, and stock without exporting seller data", () => {
    const p = listingToProduct("abc", { ...listing, sellerId: "private", shopId: "shop" });
    expect(p).toMatchObject({ id: "firebase_abc", price_cents: 4550, currency: "USDC", quantity: 2, sizes: ["38"], image_url: listing.imageUrls[0] });
    expect(p).not.toHaveProperty("sellerId");
    expect(p).not.toHaveProperty("shopId");
  });

  it.each(["sold", "draft", "archived"])("excludes %s listings", (status) => {
    expect(listingToProduct("id", { ...listing, status })).toBeNull();
  });

  it("does not invent stock for explicit sold-out variants", () => {
    expect(listingToProduct("id", { ...listing, variants: [{ size: "38", quantity: 0 }] })).toBeNull();
  });

  it.each(["", "NaN", "-10", "3.001", "1e3"])("rejects invalid or unsupported price precision: %s", (priceUsdc) => {
    expect(listingToProduct("id", { ...listing, priceUsdc })).toBeNull();
  });

  it("decodes nested Firestore arrays and timestamps", () => {
    expect(decodeFirestore({ mapValue: { fields: { sizes: { arrayValue: { values: [{ stringValue: "M" }] } }, count: { integerValue: "3" }, date: { timestampValue: "2026-10-01T00:00:00Z" } } } })).toEqual({ sizes: ["M"], count: 3, date: "2026-10-01T00:00:00Z" });
  });
});
