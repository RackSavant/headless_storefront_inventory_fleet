/**
 * Synthetic shoppers: the harness's source of hard metric signals.
 *
 * Each shopper has an occasion, budget and private taste, picks an item in the
 * store, is shown the looks the current policy builds, and responds according
 * to a HIDDEN ground truth of what goes together. The truth overlaps the seed
 * rules but differs in specific, learnable ways, so a policy improves only by
 * discovering what shoppers actually respond to. All outcomes are expected
 * values (no coin flips), so two policies compared on the same shoppers give a
 * clean paired difference.
 */
import { colorHarmony, colorFamily } from "@/lib/color";
import { genderCompatible, SEED_RULES, styleScore } from "@/lib/reco/compat";
import { isSlowMover } from "@/lib/reco/merch";
import { buildLooks } from "@/lib/reco/outfit";
import type { Gender, Look, Product, RuleSpec, ShopperContext, StoreConfig, Style, Weights } from "@/lib/types";
import { resolveScoring, segmentsFor } from "./policy";
import type { Diagnostics, Metrics, PairStat, Policy, SegmentId, SegmentStat } from "./types";

export const SIM_NOW = new Date("2026-10-11T00:00:00Z");

/* ---------------- deterministic randomness ---------------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash01(...parts: Array<string | number>): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/* ---------------- the hidden truth ---------------- */

const TRUE_WEIGHTS: Record<"formal" | "casual", Weights> = {
  formal: { color: 0.25, style: 0.25, formality: 0.4, season: 0.1 },
  casual: { color: 0.5, style: 0.3, formality: 0.1, season: 0.1 },
};

const HIDDEN_RULES: Array<Omit<RuleSpec, "id" | "origin">> = [
  { a: "denim-jacket", b: "slim-jean|straight-jean", bonus: -0.3, reason: "double denim" },
  { a: "loafer", b: "wide-leg-trouser|midi-skirt", bonus: 0.15, reason: "loafer + fluid trouser" },
  { a: "tote|backpack", b: "cocktail-dress|slip-dress|silk-camisole|tailored-trouser|wide-leg-trouser", bonus: -0.25, reason: "day bag with eveningwear" },
  { a: "belt", b: "slip-dress|cocktail-dress|knit-midi-dress|sundress|maxi-dress", bonus: -0.25, reason: "belt over a dress" },
  { a: "chelsea-boot|ankle-boot", b: "knit-midi-dress|midi-skirt", bonus: 0.15, reason: "boots with a midi" },
  { a: "hoodie", b: "tailored-blazer|wool-coat|trench-coat", bonus: -0.3, reason: "hoodie under tailoring" },
  { a: "clutch", b: "cocktail-dress|slip-dress", bonus: 0.15, reason: "clutch for evening" },
  { a: "socks", b: "loafer|oxford|derby|chelsea-boot", bonus: 0.12, reason: "socks with leather shoes" },
  { a: "leather-jacket", b: "slip-dress|mini-skirt|band-tee", bonus: 0.15, reason: "moto over something soft" },
  { a: "cargo-pant", b: "tailored-blazer|silk-camisole", bonus: -0.2, reason: "cargo with tailoring" },
];

// Built on first use, not at module load: Turbopack's dev bundler can evaluate this
// module before compat.ts has finished, leaving SEED_RULES undefined at load time.
let truthRules: Array<{ a: RegExp; b: RegExp; bonus: number }> | null = null;
function truth() {
  truthRules ??= [...SEED_RULES, ...HIDDEN_RULES].map((r) => ({ a: new RegExp(r.a), b: new RegExp(r.b), bonus: r.bonus }));
  return truthRules;
}

function trueCompat(x: Product, y: Product, formal: boolean): number {
  if (!genderCompatible(x.gender, y.gender)) return 0;
  const w = TRUE_WEIGHTS[formal ? "formal" : "casual"];
  const color = colorHarmony(x.color, y.color).score;
  const style = styleScore(x.styles, y.styles).score;
  const formality = Math.max(0, 1 - Math.abs(x.formality - y.formality) / 2.5);
  const season = x.seasons.some((s) => y.seasons.includes(s)) ? 1 : 0.3;
  let rule = 0;
  for (const r of truth())
    if ((r.a.test(x.subtype) && r.b.test(y.subtype)) || (r.a.test(y.subtype) && r.b.test(x.subtype))) rule += r.bonus;
  return Math.max(0, Math.min(1, w.color * color + w.style * style + w.formality * formality + w.season * season + rule));
}

/* ---------------- shoppers ---------------- */

const OCCASIONS: Array<{ label: string; formality: number; styles: Style[]; weight: number }> = [
  { label: "Weekend", formality: 2, styles: ["casual", "minimal"], weight: 0.26 },
  { label: "Office", formality: 4, styles: ["classic", "minimal"], weight: 0.14 },
  { label: "Dinner & drinks", formality: 3, styles: ["minimal", "romantic", "edgy"], weight: 0.14 },
  { label: "Wedding guest", formality: 4, styles: ["formal", "romantic", "classic"], weight: 0.13 },
  { label: "Gala", formality: 5, styles: ["formal"], weight: 0.05 },
  { label: "Active", formality: 1, styles: ["athleisure"], weight: 0.1 },
  { label: "Concert", formality: 2, styles: ["edgy", "streetwear"], weight: 0.1 },
  { label: "Vacation", formality: 2, styles: ["boho", "casual"], weight: 0.08 },
];

const AVOIDABLE = ["red", "green", "yellow", "purple", "pink", "orange", "denim", "black", "brown"];

export interface SimShopper {
  idx: number;
  ctx: ShopperContext;
  budget_cents: number;
  favorite: Style[];
  avoid_color: string | null;
  price_sensitivity: number;
  deal_response: number;
  anchor: Product;
}

function pick<T>(rng: () => number, items: T[], weight: (t: T) => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rng() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

export function generateShoppers(seed: number, n: number, inventory: Product[]): SimShopper[] {
  const rng = mulberry32(seed);
  const stock = inventory.filter((p) => (p.quantity ?? 0) > 0);
  const out: SimShopper[] = [];
  for (let i = 0; i < n; i++) {
    const occ = pick(rng, OCCASIONS, (o) => o.weight);
    const g = rng();
    const gender: Gender | undefined = g < 0.55 ? "women" : g < 0.95 ? "men" : undefined;
    const budget = Math.round((150 + rng() * 550) / 10) * 1000;
    const pool = stock.filter((p) => !gender || genderCompatible(p.gender, gender));
    const anchor = pick(rng, pool, (p) => Math.exp(-1.3 * Math.abs(p.formality - occ.formality)) * (p.seasons.includes("fall") ? 1 : 0.4));
    const favorite = [occ.styles[Math.floor(rng() * occ.styles.length)], pick(rng, ["casual", "minimal", "classic", "edgy", "boho", "romantic", "streetwear", "preppy"] as Style[], () => 1)];
    out.push({
      idx: i,
      ctx: {
        occasion: occ.label,
        formality: occ.formality,
        styles: occ.styles,
        season: "fall",
        gender,
        // Only some shoppers say their budget out loud.
        budget_cents: rng() < 0.4 ? budget : undefined,
      },
      budget_cents: budget,
      favorite,
      avoid_color: rng() < 0.6 ? AVOIDABLE[Math.floor(rng() * AVOIDABLE.length)] : null,
      price_sensitivity: 0.3 + rng() * 0.7,
      deal_response: 0.5 + rng(),
      anchor,
    });
  }
  return out;
}

/* ---------------- one shopper's reaction to the looks ---------------- */

interface Reaction {
  satisfaction: number;
  revenue: number;
  margin: number;
  affiliate: number;
  purchase_prob: number;
  slow_units: number;
  /** For diagnostics: expected rejection per (item, partner) pair across all shown looks. */
  pairs: Array<{ key: string; rejected: number }>;
}

function acceptProb(s: SimShopper, x: Product, look: Product[], formal: boolean): number {
  const others = look.filter((y) => y.id !== x.id);
  const fit = others.reduce((sum, y) => sum + trueCompat(x, y, formal), 0) / Math.max(1, others.length);
  let taste = 0;
  if (s.avoid_color && colorFamily(x.color.name, x.color.hex) === s.avoid_color) taste -= 0.3;
  if (x.styles.some((st) => s.favorite.includes(st))) taste += 0.06;
  const price = -0.06 * s.price_sensitivity * (x.price_cents / 15000);
  const noise = (hash01(s.idx, x.id) - 0.5) * 0.08;
  return sigmoid((fit + taste + price + noise - 0.76) * 14);
}

function react(s: SimShopper, looks: Look[], config: StoreConfig, now: Date): Reaction {
  const formal = (s.ctx.formality ?? 3) >= 4;
  const pairs: Reaction["pairs"] = [];
  let best = { sat: 0, look: null as Look | null, probs: new Map<string, number>() };

  for (const look of looks) {
    const items = look.items.map((i) => i.product);
    const probs = new Map<string, number>();
    const rest = items.filter((p) => p.id !== s.anchor.id);
    for (const x of rest) {
      const p = acceptProb(s, x, items, formal);
      probs.set(x.id, p);
      for (const y of items) {
        if (y.id === x.id) continue;
        pairs.push({ key: [x.subtype, y.subtype].sort().join(" + "), rejected: 1 - p });
      }
    }
    const sat = rest.length ? rest.reduce((sum, x) => sum + probs.get(x.id)!, 0) / rest.length : 0;
    if (sat > best.sat || !best.look) best = { sat, look, probs };
  }

  const r: Reaction = { satisfaction: best.sat, revenue: 0, margin: 0, affiliate: 0, purchase_prob: 0, slow_units: 0, pairs };
  const look = best.look;
  if (!look) return r;
  const items = look.items.map((i) => i.product);
  const unit = (p: Product, price: number) => ({ revenue: price, margin: price - (p.cost_cents ?? p.price_cents * 0.45) });

  // Bundle: needs every non-anchor bundle piece accepted, then a price/deal decision.
  let pBundle = 0;
  if (look.bundle) {
    const pieces = items.filter((p) => look.bundle!.product_ids.includes(p.id) && p.id !== s.anchor.id);
    const pAll = pieces.reduce((acc, p) => acc * (best.probs.get(p.id) ?? 0), 1);
    const pDeal = sigmoid(-1.6 + 4 * (best.sat - 0.5) + s.deal_response * 0.09 * look.bundle.discount_pct - s.price_sensitivity * 2.2 * (look.bundle.price_cents / s.budget_cents));
    pBundle = pAll * pDeal;
    const bundleItems = items.filter((p) => look.bundle!.product_ids.includes(p.id));
    const ratio = look.bundle.price_cents / look.bundle.list_cents;
    for (const p of bundleItems) {
      const u = unit(p, p.price_cents * ratio);
      r.revenue += pBundle * u.revenue;
      r.margin += pBundle * u.margin;
      if (isSlowMover(p, config, now)) r.slow_units += pBundle;
    }
  }

  // Otherwise the anchor alone (more likely when the look made it feel right).
  const pAnchor = (1 - pBundle) * sigmoid(-1.3 + 3 * (best.sat - 0.5) - s.price_sensitivity * 1.5 * (s.anchor.price_cents / s.budget_cents));
  const ua = unit(s.anchor, s.anchor.price_cents);
  r.revenue += pAnchor * ua.revenue;
  r.margin += pAnchor * ua.margin;
  if (isSlowMover(s.anchor, config, now)) r.slow_units += pAnchor;

  // Loose in-store add-ons when there was no bundle deal.
  for (const p of items) {
    if (p.id === s.anchor.id || p.source !== "inventory" || look.bundle?.product_ids.includes(p.id)) continue;
    const pp = (best.probs.get(p.id) ?? 0) * 0.2 * (1 - 0.5 * s.price_sensitivity);
    const u = unit(p, p.price_cents);
    r.revenue += pp * u.revenue;
    r.margin += pp * u.margin;
    if (isSlowMover(p, config, now)) r.slow_units += pp;
  }

  // Partner pieces: click, then an 8% affiliate commission on the ones bought.
  for (const p of items) if (p.source === "external") r.affiliate += (best.probs.get(p.id) ?? 0) * 0.5 * 0.3 * 0.08 * p.price_cents;

  r.purchase_prob = Math.min(1, pBundle + pAnchor);
  return r;
}

/* ---------------- evaluating a policy ---------------- */

export function scoreOf(m: Omit<Metrics, "score">): number {
  return m.profit_per_shopper + 25 * m.satisfaction + 0.1 * m.slow_units_per_100;
}

export function evaluate(policy: Policy, shoppers: SimShopper[], catalog: Product[]): Diagnostics {
  let revenue = 0;
  let margin = 0;
  let affiliate = 0;
  let sat = 0;
  let conv = 0;
  let slow = 0;
  const pairAgg = new Map<string, { shown: number; rejected: number }>();
  const segAgg = new Map<SegmentId, { n: number; sat: number; profit: number }>();

  for (const s of shoppers) {
    const scoring = resolveScoring(policy, s.ctx);
    const looks = buildLooks({ anchors: [s.anchor], catalog, config: policy.config, context: s.ctx, scoring, count: 3, now: SIM_NOW });
    const r = react(s, looks, policy.config, SIM_NOW);
    revenue += r.revenue;
    margin += r.margin;
    affiliate += r.affiliate;
    sat += r.satisfaction;
    conv += r.purchase_prob;
    slow += r.slow_units;
    for (const p of r.pairs) {
      const a = pairAgg.get(p.key) ?? { shown: 0, rejected: 0 };
      a.shown += 1;
      a.rejected += p.rejected;
      pairAgg.set(p.key, a);
    }
    for (const seg of segmentsFor(s.ctx)) {
      const a = segAgg.get(seg) ?? { n: 0, sat: 0, profit: 0 };
      a.n += 1;
      a.sat += r.satisfaction;
      a.profit += (r.margin + r.affiliate) / 100;
      segAgg.set(seg, a);
    }
  }

  const n = Math.max(1, shoppers.length);
  const base = {
    shoppers: shoppers.length,
    profit_per_shopper: (margin + affiliate) / 100 / n,
    revenue_per_shopper: revenue / 100 / n,
    margin_rate: revenue ? margin / revenue : 0,
    conversion: conv / n,
    satisfaction: sat / n,
    slow_units_per_100: (slow / n) * 100,
    affiliate_per_shopper: affiliate / 100 / n,
  };
  const metrics: Metrics = { ...base, score: scoreOf(base) };

  const ruleRegexes = [...policy.rules, ...Object.values(policy.segments).flatMap((o) => o?.rules ?? [])].map((r) => ({
    a: new RegExp(r.a),
    b: new RegExp(r.b),
  }));
  const pairs: PairStat[] = [...pairAgg.entries()].map(([pair, a]) => {
    const [x, y] = pair.split(" + ");
    return {
      pair,
      shown: a.shown,
      rejected: Math.round(a.rejected * 10) / 10,
      reject_rate: a.rejected / a.shown,
      has_rule: ruleRegexes.some((r) => (r.a.test(x) && r.b.test(y)) || (r.a.test(y) && r.b.test(x))),
    };
  });
  const segments: SegmentStat[] = [...segAgg.entries()].map(([segment, a]) => ({
    segment,
    shoppers: a.n,
    satisfaction: a.sat / a.n,
    profit_per_shopper: a.profit / a.n,
  }));
  return { metrics, pairs, segments };
}

/** Fixed shopper panels: the agent learns on TRAIN; promotion also requires HOLDOUT to improve. */
export const PANELS = { train: { seed: 101, n: 120 }, holdout: { seed: 202, n: 120 } };
