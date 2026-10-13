/**
 * Owner dashboard numbers. Two sources:
 *  - gap analysis: run the recommender over every in-stock item and count which
 *    external categories your stock keeps needing (works before any traffic)
 *  - live demand: events from shoppers (looks shown, partner clicks, bundle adds)
 */
import { allProducts, loadCatalog } from "@/lib/catalog";
import { colorFamily } from "@/lib/color";
import { daysInStock, isSlowMover, stockPressure } from "@/lib/reco/merch";
import { buildLooks } from "@/lib/reco/outfit";
import type { Product, StoreEvent } from "@/lib/types";
import { moneyTotals } from "./money";

export interface DemandRow {
  key: string;
  role: string;
  subtype: string;
  color: string;
  label: string;
  gap_hits: number;
  shown: number;
  clicks: number;
  avg_price_cents: number;
  example_ids: string[];
}

let gapCache: { key: string; rows: Map<string, { hits: number; anchors: Set<string> }> } | null = null;

function signalKey(p: Product) {
  return `${p.role}|${p.subtype}|${colorFamily(p.color.name, p.color.hex)}`;
}

function gapAnalysis(inventory: Product[], catalog: Product[]) {
  const { config, key } = loadCatalog();
  if (gapCache?.key === key) return gapCache.rows;
  const rows = new Map<string, { hits: number; anchors: Set<string> }>();
  for (const anchor of inventory.filter((p) => (p.quantity ?? 0) > 0)) {
    for (const look of buildLooks({ anchors: [anchor], catalog, config, count: 3 })) {
      for (const it of look.items) {
        if (it.product.source !== "external") continue;
        const k = signalKey(it.product);
        const row = rows.get(k) ?? { hits: 0, anchors: new Set<string>() };
        row.hits++;
        row.anchors.add(anchor.id);
        rows.set(k, row);
      }
    }
  }
  gapCache = { key, rows };
  return rows;
}

export function computeInsights(events: StoreEvent[], now = new Date()) {
  const { inventory, config } = loadCatalog();
  const catalog = allProducts();
  const byId = new Map(catalog.map((p) => [p.id, p]));

  const count = (type: StoreEvent["type"]) => events.filter((e) => e.type === type).length;
  const perProduct = (type: StoreEvent["type"]) => {
    const m = new Map<string, number>();
    for (const e of events.filter((x) => x.type === type)) {
      for (const id of e.product_ids ?? (e.product_id ? [e.product_id] : [])) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  };
  const shown = perProduct("look_shown");
  const views = perProduct("view_item");
  const clicks = perProduct("external_click");
  const bundleAdds = perProduct("bundle_add");
  const tryOns = perProduct("try_on");

  // Demand for things you don't sell.
  const gap = gapAnalysis(inventory, catalog);
  const demand = new Map<string, DemandRow>();
  const ensure = (p: Product) => {
    const k = signalKey(p);
    let row = demand.get(k);
    if (!row) {
      const color = colorFamily(p.color.name, p.color.hex);
      const sub = p.subtype.replace(/-/g, " ");
      row = { key: k, role: p.role, subtype: p.subtype, color, label: sub.includes(color) ? sub : `${color} ${sub}`, gap_hits: 0, shown: 0, clicks: 0, avg_price_cents: 0, example_ids: [] };
      demand.set(k, row);
    }
    if (row.example_ids.length < 3 && !row.example_ids.includes(p.id)) row.example_ids.push(p.id);
    return row;
  };
  for (const p of catalog.filter((x) => x.source === "external")) {
    const k = signalKey(p);
    const g = gap.get(k);
    const s = shown.get(p.id) ?? 0;
    const c = clicks.get(p.id) ?? 0;
    if (!g && !s && !c) continue;
    const row = ensure(p);
    row.gap_hits = g?.hits ?? 0;
    row.shown += s;
    row.clicks += c;
  }
  for (const row of demand.values()) {
    const prices = catalog.filter((p) => p.source === "external" && signalKey(p) === row.key).map((p) => p.price_cents);
    row.avg_price_cents = Math.round(prices.reduce((a, b) => a + b, 0) / Math.max(1, prices.length));
  }
  const demandRows = [...demand.values()].sort(
    (a, b) => b.clicks * 5 + b.shown + b.gap_hits * 2 - (a.clicks * 5 + a.shown + a.gap_hits * 2),
  );

  const stock = inventory.map((p) => ({
    id: p.id,
    sku: p.sku,
    title: p.title,
    role: p.role,
    color: p.color,
    quantity: p.quantity ?? 0,
    price_cents: p.price_cents,
    currency: p.currency,
    cost_cents: p.cost_cents ?? 0,
    days_in_stock: daysInStock(p, now),
    pressure: Math.round(stockPressure(p, config, now) * 100) / 100,
    slow_mover: isSlowMover(p, config, now),
    views: views.get(p.id) ?? 0,
    try_ons: tryOns.get(p.id) ?? 0,
    shown_in_looks: shown.get(p.id) ?? 0,
    bundle_adds: bundleAdds.get(p.id) ?? 0,
  }));

  const revenue = events.filter((e) => e.type === "checkout").reduce((s, e) => s + (e.value_cents ?? 0), 0);
  return {
    store_name: config.store_name,
    config,
    totals: {
      retail_by_currency: moneyTotals(stock.map((p) => ({ currency: p.currency, price_cents: p.quantity * p.price_cents }))),
      cost_by_currency: moneyTotals(stock.map((p) => ({ currency: p.currency, price_cents: p.quantity * p.cost_cents }))),
      slow_by_currency: moneyTotals(stock.filter((p) => p.slow_mover).map((p) => ({ currency: p.currency, price_cents: p.quantity * p.price_cents }))),
      skus: inventory.length,
      units: stock.reduce((s, p) => s + p.quantity, 0),
      retail_value_cents: stock.reduce((s, p) => s + p.quantity * p.price_cents, 0),
      cost_value_cents: stock.reduce((s, p) => s + p.quantity * p.cost_cents, 0),
      slow_movers: stock.filter((p) => p.slow_mover).length,
      slow_mover_value_cents: stock.filter((p) => p.slow_mover).reduce((s, p) => s + p.quantity * p.price_cents, 0),
    },
    funnel: {
      shoppers: new Set(events.map((e) => e.shopper_id)).size,
      views: count("view_item"),
      try_ons: count("try_on"),
      looks_shown: count("look_shown"),
      partner_clicks: count("external_click"),
      bundle_adds: count("bundle_add"),
      add_to_cart: count("add_to_cart"),
      checkouts: count("checkout"),
      revenue_cents: revenue,
      revenue_by_currency: moneyTotals(events.filter((e) => e.type === "checkout").map((e) => ({ currency: e.currency ?? "USD", price_cents: e.value_cents ?? 0 }))),
    },
    stock: stock.sort((a, b) => b.pressure - a.pressure),
    demand: demandRows.slice(0, 20).map((r) => ({ ...r, examples: r.example_ids.map((id) => byId.get(id)?.title ?? id) })),
    recent: events.slice(-25).reverse(),
  };
}
