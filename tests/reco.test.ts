import { describe, expect, it } from "vitest";
import { allProducts, getProducts, loadCatalog } from "@/lib/catalog";
import { colorHarmony } from "@/lib/color";
import { pairScore } from "@/lib/reco/compat";
import { priceBundle } from "@/lib/reco/merch";
import { buildInventoryBundles, buildLooks } from "@/lib/reco/outfit";
import { applyFeedback, emptyProfile } from "@/lib/reco/profile";
import type { Product, StoreConfig } from "@/lib/types";

const { config } = loadCatalog();
const catalog = allProducts();
const now = new Date("2026-10-11T00:00:00Z");
const one = (id: string) => getProducts([id])[0];

describe("pair compatibility", () => {
  it("prefers jeans over joggers for chelsea boots", () => {
    const boots = one("inv_leather-chelsea-boots");
    expect(pairScore(boots, one("ext_slim-jean_indigo-denim")).total).toBeGreaterThan(
      pairScore(boots, one("ext_jogger_heather-grey")).total,
    );
  });
  it("penalizes dress shoes with athletic wear", () => {
    expect(pairScore(one("inv_cap-toe-oxfords"), one("ext_jogger_black")).total).toBeLessThan(0.4);
  });
  it("never pairs across gendered items", () => {
    expect(pairScore(one("inv_cap-toe-oxfords"), one("ext_slip-dress_black")).total).toBe(0);
  });
  it("treats neutrals as safe and same-wash denim as weak", () => {
    expect(colorHarmony({ name: "navy", hex: "#1f2a44" }, { name: "crimson", hex: "#b3202a" }).score).toBeGreaterThan(0.8);
    expect(colorHarmony({ name: "indigo denim", hex: "#2e3f63" }, { name: "indigo denim", hex: "#2e3f63" }).score).toBeLessThan(0.6);
  });
});

describe("complete the look", () => {
  const anchor = one("inv_leather-chelsea-boots");
  const looks = buildLooks({ anchors: [anchor], catalog, config, now });

  it("returns complete, distinct outfits around the anchor", () => {
    expect(looks.length).toBe(3);
    for (const look of looks) {
      expect(look.items.some((i) => i.product.id === anchor.id)).toBe(true);
      const roles = look.items.map((i) => i.product.role);
      expect(roles).toContain("shoes");
      expect(roles.includes("dress") || (roles.includes("top") && roles.includes("bottom"))).toBe(true);
      expect(new Set(roles).size).toBe(roles.length);
    }
    expect(new Set(looks.map((l) => l.id)).size).toBe(3);
  });

  it("recommends pants and tops from outside the inventory for a shoe store", () => {
    const bottoms = looks.flatMap((l) => l.items).filter((i) => i.product.role === "bottom" || i.product.role === "dress");
    expect(bottoms.length).toBeGreaterThan(0);
    expect(bottoms.every((i) => i.product.source === "external")).toBe(true);
  });

  it("never sends shoppers elsewhere for categories the store stocks", () => {
    for (const look of looks)
      for (const i of look.items) if (i.product.role === "shoes") expect(i.product.source).toBe("inventory");
  });

  it("bundles in-store items with a discount", () => {
    const withBundle = looks.filter((l) => l.bundle);
    expect(withBundle.length).toBeGreaterThan(0);
    for (const l of withBundle) {
      expect(l.bundle!.price_cents).toBeLessThan(l.bundle!.list_cents);
      for (const id of l.bundle!.product_ids) expect(id.startsWith("inv_")).toBe(true);
    }
  });

  it("dresses men's anchors only in men's / unisex items", () => {
    const men = buildLooks({ anchors: [one("inv_cap-toe-oxfords")], catalog, config, now });
    for (const look of men) {
      expect(look.template).toBe("separates");
      for (const i of look.items) expect(i.product.gender).not.toBe("women");
    }
  });

  it("follows the occasion", () => {
    const gym = buildLooks({ anchors: [one("inv_white-leather-court-sneakers")], catalog, config, now, context: { formality: 1, styles: ["athleisure"] } });
    const top = gym[0].items.find((i) => i.product.role === "top" || i.product.role === "bottom")!;
    expect(top.product.formality).toBeLessThanOrEqual(2);
  });

  it("is fast enough to run per click", () => {
    const t0 = performance.now();
    buildLooks({ anchors: [one("inv_nude-crisscross-stilettos")], catalog, config, now });
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("taste memory", () => {
  it("learns from a dislike reason and steers the next looks", () => {
    const anchor = one("inv_white-leather-court-sneakers");
    let profile = emptyProfile("t");
    const before = buildLooks({ anchors: [anchor], catalog, config, now, profile });
    const denim = before.flatMap((l) => l.items).find((i) => /denim/.test(i.product.color.name))!.product;
    const res = applyFeedback(profile, denim, "dislike", "not a fan of denim");
    expect(res.learned.some((l) => l.key === "color" && l.value === "denim")).toBe(true);
    profile = res.profile;
    const after = buildLooks({ anchors: [anchor], catalog, config, now, profile });
    const countDenim = (ls: typeof before) => ls.flatMap((l) => l.items).filter((i) => /denim/.test(i.product.color.name)).length;
    expect(countDenim(after)).toBeLessThan(countDenim(before));
    expect(after.flatMap((l) => l.items).some((i) => i.product.id === denim.id)).toBe(false);
  });

  it("maps 'too formal' to a formality preference", () => {
    const { profile, learned } = applyFeedback(emptyProfile("t"), one("ext_tailored-blazer_navy"), "dislike", "way too formal for me");
    expect(learned[0]).toMatchObject({ key: "formality", value: "lower" });
    expect(profile.formality_bias).toBeLessThan(0);
  });
});

describe("bundle pricing", () => {
  it("never discounts below the margin floor", () => {
    const cfg: StoreConfig = { ...config, bundle_discounts: { "2": 60 } };
    const items = getProducts(["inv_leather-chelsea-boots", "inv_leather-belt"]) as Product[];
    const b = priceBundle(items, cfg, now)!;
    const floor = items.reduce((s, p) => s + Math.ceil(p.cost_cents! * (1 + cfg.min_margin_pct / 100)), 0);
    expect(b.price_cents).toBeGreaterThanOrEqual(floor);
  });
  it("adds the slow-mover discount only when one is in the bundle", () => {
    const fresh = getProducts(["inv_cap-toe-oxfords", "inv_waterproof-hiking-boots"]);
    const slow = getProducts(["inv_cap-toe-oxfords", "inv_platform-canvas-sneakers"]);
    expect(priceBundle(fresh, config, now)!.discount_pct).toBe(10);
    expect(priceBundle(slow, config, now)!.discount_pct).toBe(15);
  });
  it("offers a second-pair bundle for a shoe store", () => {
    const bundles = buildInventoryBundles({ anchors: [one("inv_leather-chelsea-boots")], catalog, config, now });
    expect(bundles.some((b) => b.items.filter((p) => p.role === "shoes").length === 2)).toBe(true);
  });
});
