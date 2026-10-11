/**
 * Merchandising: how hard to push each in-stock item, and how to price bundles
 * so they move inventory without dropping below a margin floor.
 */
import type { Bundle, Product, StoreConfig } from "@/lib/types";

const DAY = 86_400_000;

export function daysInStock(p: Product, now: Date): number {
  if (!p.received_at) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(p.received_at).getTime()) / DAY));
}

/** 0..1, high for old stock and deep quantity. */
export function stockPressure(p: Product, cfg: StoreConfig, now: Date): number {
  if (p.source !== "inventory") return 0;
  const age = Math.min(1, daysInStock(p, now) / cfg.slow_mover_days);
  const depth = Math.min(1, Math.max(0, ((p.quantity ?? 1) - 1) / 6));
  return 0.65 * age + 0.35 * depth;
}

export function isSlowMover(p: Product, cfg: StoreConfig, now: Date): boolean {
  return p.source === "inventory" && daysInStock(p, now) >= cfg.slow_mover_days;
}

export function inventoryBoost(p: Product, cfg: StoreConfig, now: Date): number {
  if (p.source !== "inventory") return 0;
  return cfg.inventory_boost * (1 + stockPressure(p, cfg, now));
}

export function merchNote(p: Product, cfg: StoreConfig, now: Date): string | undefined {
  if (p.source !== "inventory") return undefined;
  const days = daysInStock(p, now);
  const parts = [`${p.quantity ?? 0} in stock`, `${days} days on shelf`];
  if (isSlowMover(p, cfg, now)) parts.push("slow mover, boosted");
  return parts.join(" · ");
}

function floorPrice(p: Product, cfg: StoreConfig): number {
  if (!p.cost_cents) return 0;
  return Math.ceil(p.cost_cents * (1 + cfg.min_margin_pct / 100));
}

/** Price the in-store part of a look. Needs at least two inventory items to be a bundle. */
export function priceBundle(items: Product[], cfg: StoreConfig, now: Date): Bundle | null {
  const inv = items.filter((p) => p.source === "inventory" && (p.quantity ?? 0) > 0);
  if (inv.length < 2) return null;

  const tiers = Object.keys(cfg.bundle_discounts).map(Number).sort((a, b) => a - b);
  const tier = tiers.filter((t) => t <= inv.length).pop();
  let pct = tier ? cfg.bundle_discounts[String(tier)] : 0;
  const slow = inv.some((p) => isSlowMover(p, cfg, now));
  if (slow) pct += cfg.slow_mover_extra_pct;

  const list = inv.reduce((s, p) => s + p.price_cents, 0);
  // Apply the discount per item, but never below each item's margin floor.
  const price = inv.reduce((s, p) => s + Math.max(floorPrice(p, cfg), Math.round(p.price_cents * (1 - pct / 100))), 0);
  const effective = Math.round(((list - price) / list) * 100);

  return {
    product_ids: inv.map((p) => p.id),
    list_cents: list,
    price_cents: price,
    discount_pct: effective,
    label: `Buy ${inv.length} together, save ${effective}%`,
  };
}
