import { describe, expect, it } from "vitest";
import { formatMoney, formatTotals } from "@/lib/money";
import { priceBundle } from "@/lib/reco/merch";
import { loadCatalog } from "@/lib/catalog";

describe("currency preservation", () => {
  it("labels USDC explicitly without a dollar symbol", () => {
    expect(formatMoney(4550, "USDC")).toBe("45.50 USDC");
    expect(formatMoney(4550, "USD")).toBe("$45.50");
  });

  it("does not add different currencies into a fictional total", () => {
    expect(formatTotals([{ price_cents: 1000, currency: "USD" }, { price_cents: 2000, currency: "USDC" }, { price_cents: 500, currency: "USDC" }])).toBe("$10 + 25 USDC");
  });

  it("rejects mixed-currency bundles and preserves a USDC bundle's currency", () => {
    const { inventory, config } = loadCatalog();
    const items = inventory.slice(0, 2).map((p) => ({ ...p, quantity: 2 }));
    expect(priceBundle([{ ...items[0], currency: "USDC" }, items[1]], config, new Date())).toBeNull();
    expect(priceBundle(items.map((p) => ({ ...p, currency: "USDC" })), config, new Date())?.currency).toBe("USDC");
  });
});
