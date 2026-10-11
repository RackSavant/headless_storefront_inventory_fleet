/**
 * "Complete the look". Given anchor item(s) — the shoe a shopper clicked, or
 * whatever they dropped into mix & match — fill the remaining outfit slots by
 * beam search over pairwise compatibility, preferring in-stock items and
 * reaching into the external catalog only for slots the store can't cover.
 */
import { colorFamily } from "@/lib/color";
import { genderCompatible, pairScore } from "@/lib/reco/compat";
import { inventoryBoost, merchNote, priceBundle } from "@/lib/reco/merch";
import { profileScore } from "@/lib/reco/profile";
import type {
  Gender,
  Look,
  LookItem,
  Product,
  Role,
  ShopperContext,
  ShopperProfile,
  StoreConfig,
  Style,
} from "@/lib/types";

const TEMPLATES: Record<Look["template"], { required: Role[]; optional: Role[] }> = {
  separates: { required: ["top", "bottom", "shoes"], optional: ["outerwear", "bag", "accessory"] },
  dress: { required: ["dress", "shoes"], optional: ["outerwear", "bag", "accessory"] },
};

const BEAM_WIDTH = 14;
const CANDIDATES_PER_SLOT = 7;
const OPTIONAL_REWARD = 0.035;
/** An optional piece (bag, jacket, accessory) must go with the look at least this well to be added. */
const OPTIONAL_MIN_COMPAT = 0.62;

export interface BuildLooksInput {
  anchors: Product[];
  catalog: Product[];
  config: StoreConfig;
  profile?: ShopperProfile | null;
  context?: ShopperContext;
  count?: number;
  now?: Date;
}

interface Beam {
  items: Product[];
  score: number;
}

/** Fit of a single item to what the shopper asked for (occasion, season, styles, budget). 0..1 */
export function contextFit(p: Product, ctx: ShopperContext, profile?: ShopperProfile | null): number {
  let s = 0;
  let n = 0;
  const target = ctx.formality !== undefined ? ctx.formality + (profile?.formality_bias ?? 0) * 0.5 : undefined;
  if (target !== undefined) {
    s += Math.max(0, 1 - Math.abs(p.formality - target) / 2.5);
    n++;
  } else if (profile?.formality_bias) {
    s += 0.5 + 0.1 * Math.sign(profile.formality_bias) * (p.formality - 3);
    n++;
  }
  if (ctx.season) {
    s += p.seasons.includes(ctx.season) ? 1 : 0.1;
    n++;
  }
  if (ctx.styles?.length) {
    s += p.styles.some((x) => ctx.styles!.includes(x)) ? 1 : 0.3;
    n++;
  }
  return n ? s / n : 0.5;
}

function inStock(p: Product): boolean {
  return p.source === "external" || (p.quantity ?? 0) > 0;
}

function effectiveGender(anchors: Product[], ctx: ShopperContext): Gender | undefined {
  if (ctx.gender && ctx.gender !== "unisex") return ctx.gender;
  return anchors.find((a) => a.gender !== "unisex")?.gender;
}

// Beam search re-scores the same pairs thousands of times; ids are stable within a request.
let pairCache = new Map<string, number>();

function pair(a: Product, b: Product): number {
  const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
  let v = pairCache.get(key);
  if (v === undefined) {
    v = pairScore(a, b).total;
    pairCache.set(key, v);
  }
  return v;
}

function pairStats(items: Product[]): { mean: number; worst: number } {
  let s = 0;
  let n = 0;
  let worst = 1;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const v = pair(items[i], items[j]);
      s += v;
      n++;
      worst = Math.min(worst, v);
    }
  return { mean: n ? s / n : 0.5, worst };
}

/**
 * Which candidates may fill a slot. In categories you stock in depth
 * (protect_inventory_roles), only your items are eligible, so shoppers aren't
 * sent elsewhere for what you sell. Elsewhere your items compete with partner
 * items on fit, carrying the inventory boost.
 */
export function slotPool(
  role: Role,
  current: Product[],
  catalog: Product[],
  gender: Gender | undefined,
  cfg: StoreConfig,
  profile?: ShopperProfile | null,
): Product[] {
  const taken = new Set(current.map((p) => p.id));
  const eligible = catalog.filter(
    (p) =>
      p.role === role &&
      !taken.has(p.id) &&
      inStock(p) &&
      (!gender || genderCompatible(p.gender, gender)) &&
      !profile?.disliked_ids.includes(p.id),
  );
  const inv = eligible.filter((p) => p.source === "inventory");
  if (cfg.protect_inventory_roles && inv.length >= cfg.protect_min_items) return inv;
  return eligible;
}

function scoreLook(items: Product[], anchors: Set<string>, input: BuildLooksInput, now: Date): number {
  const ctx = input.context ?? {};
  const { mean: compat, worst } = pairStats(items);
  const fit = items.reduce((s, p) => s + contextFit(p, ctx, input.profile), 0) / items.length;
  const pers = items.reduce((s, p) => s + profileScore(input.profile ?? null, p), 0) / items.length;
  const boost = items
    .filter((p) => !anchors.has(p.id))
    .reduce((s, p) => s + inventoryBoost(p, input.config, now), 0);
  let budget = 0;
  if (ctx.budget_cents) {
    const total = items.reduce((s, p) => s + p.price_cents, 0);
    if (total > ctx.budget_cents) budget = -0.15 - 0.6 * Math.min(1, (total - ctx.budget_cents) / ctx.budget_cents);
  }
  // A weak pair anywhere sinks the look; mean alone would hide one clashing piece.
  const clash = worst < 0.4 ? -(0.4 - worst) : 0;
  return compat + 0.2 * fit + pers + boost + budget + clash;
}

function searchTemplate(
  template: Look["template"],
  input: BuildLooksInput,
  gender: Gender | undefined,
  now: Date,
): Beam[] {
  const anchorRoles = new Set(input.anchors.map((a) => a.role));
  const t = TEMPLATES[template];
  const slots = [
    ...t.required.filter((r) => !anchorRoles.has(r)).map((r) => ({ role: r, optional: false })),
    ...t.optional.filter((r) => !anchorRoles.has(r)).map((r) => ({ role: r, optional: true })),
  ];
  const anchorIds = new Set(input.anchors.map((a) => a.id));
  let beams: Beam[] = [{ items: [...input.anchors], score: 0 }];

  for (const slot of slots) {
    const next: Beam[] = [];
    for (const beam of beams) {
      const pool = slotPool(slot.role, beam.items, input.catalog, gender, input.config, input.profile);
      const ranked = pool
        .filter((p) => !slot.optional || beam.items.reduce((s, x) => s + pair(p, x), 0) / beam.items.length >= OPTIONAL_MIN_COMPAT)
        .map((p) => ({ p, s: scoreLook([...beam.items, p], anchorIds, input, now) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, CANDIDATES_PER_SLOT);
      for (const { p, s } of ranked) {
        const optionalCount = beam.items.length + 1 - input.anchors.length;
        next.push({ items: [...beam.items, p], score: s + (slot.optional ? OPTIONAL_REWARD * optionalCount : 0) });
      }
      if (slot.optional || !ranked.length) next.push(beam);
    }
    beams = dedupe(next)
      .sort((a, b) => b.score - a.score)
      .slice(0, BEAM_WIDTH);
  }
  return beams
    .filter((b) => t.required.every((r) => b.items.some((p) => p.role === r)))
    .map((b) => ({ ...b, score: scoreLook(b.items, anchorIds, input, now) + OPTIONAL_REWARD * b.items.length }));
}

function dedupe(beams: Beam[]): Beam[] {
  const seen = new Set<string>();
  return beams.filter((b) => {
    const key = b.items.map((p) => p.id).sort().join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Greedy diverse pick: penalize looks that reuse non-anchor items already shown. */
function pickDiverse(beams: Array<Beam & { template: Look["template"] }>, anchors: Set<string>, count: number) {
  const picked: typeof beams = [];
  const used = new Map<string, number>();
  const pool = [...beams];
  while (picked.length < count && pool.length) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    pool.forEach((b, i) => {
      const overlap = b.items.filter((p) => !anchors.has(p.id)).reduce((s, p) => s + (used.get(p.id) ?? 0), 0);
      const templateRepeat = picked.filter((x) => x.template === b.template).length;
      const v = b.score - 0.12 * overlap - 0.03 * templateRepeat;
      if (v > bestVal) {
        bestVal = v;
        bestIdx = i;
      }
    });
    const [b] = pool.splice(bestIdx, 1);
    picked.push(b);
    for (const p of b.items) used.set(p.id, (used.get(p.id) ?? 0) + 1);
  }
  return picked;
}

const STYLE_NAMES: Record<Style, string> = {
  casual: "Easy Casual",
  streetwear: "Street",
  minimal: "Clean Minimal",
  classic: "Classic",
  formal: "Evening",
  athleisure: "Off-Duty Sport",
  boho: "Boho",
  edgy: "Edge",
  preppy: "Preppy",
  romantic: "Soft Romantic",
};

function lookTitle(items: Product[], ctx: ShopperContext): string {
  const counts = new Map<Style, number>();
  for (const p of items) for (const s of p.styles) counts.set(s, (counts.get(s) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "casual";
  const base = STYLE_NAMES[top];
  return ctx.occasion ? `${base} · ${ctx.occasion}` : base;
}

/** Explain an item mainly against the shopper's pick, then against its best partner in the look. */
function itemReasons(p: Product, others: Product[], anchors: Set<string>): string[] {
  const scored = others
    .map((o) => ({ o, s: pairScore(p, o) }))
    .sort((a, b) => Number(anchors.has(b.o.id)) - Number(anchors.has(a.o.id)) || b.s.total - a.s.total);
  const out: string[] = [];
  for (const { s } of scored.slice(0, 2)) for (const r of s.reasons) if (!out.includes(r)) out.push(r);
  return out.slice(0, 3);
}

function blurb(items: Product[], anchors: Product[]): string {
  const anchor = anchors[0] ?? items[0];
  const rest = items.filter((p) => p.id !== anchor.id);
  const colors = [...new Set(items.map((p) => colorFamily(p.color.name, p.color.hex)))];
  const palette = colors.length <= 2 ? "a tight two-tone palette" : `a ${colors.slice(0, 3).join(", ")} palette`;
  return `Built around the ${anchor.title.toLowerCase()}: ${rest
    .map((p) => p.title.toLowerCase())
    .join(", ")}. Kept to ${palette}.`;
}

export function buildLooks(input: BuildLooksInput): Look[] {
  pairCache = new Map();
  const now = input.now ?? new Date();
  const ctx = input.context ?? {};
  const count = input.count ?? 3;
  const gender = effectiveGender(input.anchors, ctx);
  const anchorRoles = new Set(input.anchors.map((a) => a.role));

  const templates = (Object.keys(TEMPLATES) as Look["template"][]).filter((t) => {
    if (t === "dress" && gender === "men") return false;
    const roles = [...TEMPLATES[t].required, ...TEMPLATES[t].optional];
    return [...anchorRoles].every((r) => roles.includes(r));
  });

  const all = templates.flatMap((t) => searchTemplate(t, input, gender, now).map((b) => ({ ...b, template: t })));
  const anchorIds = new Set(input.anchors.map((a) => a.id));
  const chosen = pickDiverse(all.sort((a, b) => b.score - a.score), anchorIds, count);

  const roleOrder: Role[] = ["outerwear", "top", "dress", "bottom", "shoes", "bag", "accessory"];
  return chosen.map((b, i) => {
    const items = [...b.items].sort((x, y) => roleOrder.indexOf(x.role) - roleOrder.indexOf(y.role));
    const lookItems: LookItem[] = items.map((p) => ({
      product: p,
      reasons: anchorIds.has(p.id) ? ["your pick"] : itemReasons(p, items.filter((o) => o.id !== p.id), anchorIds),
      merch_note: merchNote(p, input.config, now),
    }));
    return {
      id: `look_${i}_${items.map((p) => p.id).join("_").slice(0, 60)}`,
      title: lookTitle(items, ctx),
      template: b.template,
      items: lookItems,
      score: Math.round(b.score * 100) / 100,
      compat: Math.round(pairStats(items).mean * 100) / 100,
      blurb: blurb(items, input.anchors),
      bundle: priceBundle(items, input.config, now),
      external_total_cents: items.filter((p) => p.source === "external").reduce((s, p) => s + p.price_cents, 0),
    };
  });
}

/**
 * In-store-only bundles for an anchor. For a store that only sells shoes this
 * is the "weekday + weekend pair" offer: a second item that covers a different
 * occasion, plus any bag / accessory that goes with it.
 */
export function buildInventoryBundles(input: BuildLooksInput) {
  const now = input.now ?? new Date();
  const anchor = input.anchors[0];
  if (!anchor) return [];
  const inv = input.catalog.filter(
    (p) => p.source === "inventory" && (p.quantity ?? 0) > 0 && p.id !== anchor.id && genderCompatible(p.gender, anchor.gender),
  );
  const scored = inv
    .map((p) => {
      const pair = pairScore(anchor, p);
      const sameRole = p.role === anchor.role;
      // Same-role partner should be different (other occasion), not a near-duplicate.
      const contrast = sameRole ? Math.min(1, Math.abs(p.formality - anchor.formality) / 2) : 1;
      const compat = sameRole ? 0.5 * pair.color + 0.5 * pair.style : pair.total;
      const s = (sameRole ? 0.6 * contrast + 0.4 * compat : compat) + inventoryBoost(p, input.config, now);
      return { p, s, sameRole };
    })
    .filter((x) => !x.sameRole || x.s > 0.55)
    .sort((a, b) => b.s - a.s);

  const sameRole = scored.filter((x) => x.sameRole).slice(0, 2);
  const otherRole = scored.filter((x) => !x.sameRole).slice(0, 2);
  const bundles = [];
  for (const partner of sameRole) {
    const extra = otherRole[0] ? [otherRole[0].p] : [];
    const items = [anchor, partner.p, ...extra];
    const b = priceBundle(items, input.config, now);
    const dressier = anchor.formality >= partner.p.formality;
    const title =
      anchor.role === "shoes"
        ? `${dressier ? "Dress-up" : "Off-duty"} + ${dressier ? "off-duty" : "dress-up"} pair`
        : `Day-to-night ${anchor.role === "bag" ? "bag" : "accessory"} set`;
    if (b) bundles.push({ ...b, items, title });
  }
  if (otherRole.length) {
    const items = [anchor, ...otherRole.map((x) => x.p)];
    const b = priceBundle(items, input.config, now);
    if (b) bundles.push({ ...b, items, title: "Finish it in-store" });
  }
  return bundles;
}
