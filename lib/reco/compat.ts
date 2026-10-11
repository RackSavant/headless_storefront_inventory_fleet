import { colorHarmony } from "@/lib/color";
import type { Gender, PairScore, Product, RuleSpec, ScoringPolicy, Style, Weights } from "@/lib/types";

/** How well two style tags sit together (symmetric; missing pairs = 0.2, same tag = 1). */
const STYLE_AFFINITY: Record<string, number> = {
  "minimal|classic": 0.85,
  "minimal|formal": 0.7,
  "minimal|casual": 0.7,
  "minimal|streetwear": 0.6,
  "minimal|edgy": 0.55,
  "classic|formal": 0.85,
  "classic|preppy": 0.85,
  "classic|casual": 0.6,
  "classic|romantic": 0.55,
  "formal|preppy": 0.6,
  "formal|romantic": 0.6,
  "casual|streetwear": 0.75,
  "casual|athleisure": 0.7,
  "casual|boho": 0.65,
  "casual|preppy": 0.65,
  "casual|edgy": 0.5,
  "streetwear|athleisure": 0.85,
  "streetwear|edgy": 0.75,
  "boho|romantic": 0.8,
  "edgy|romantic": 0.4,
  "formal|athleisure": 0,
  "formal|streetwear": 0.15,
  "boho|formal": 0.2,
};

export function styleAffinity(a: Style, b: Style): number {
  if (a === b) return 1;
  return STYLE_AFFINITY[`${a}|${b}`] ?? STYLE_AFFINITY[`${b}|${a}`] ?? 0.2;
}

/** Average over a's tags of the best match among b's tags. */
export function styleScore(a: Style[], b: Style[]): { score: number; shared: Style[] } {
  if (!a.length || !b.length) return { score: 0.5, shared: [] };
  const best = (from: Style[], to: Style[]) =>
    from.reduce((s, x) => s + Math.max(...to.map((y) => styleAffinity(x, y))), 0) / from.length;
  const score = (best(a, b) + best(b, a)) / 2;
  return { score, shared: a.filter((s) => b.includes(s)) };
}

/**
 * Stylist pairing knowledge: subtype combinations that are classic (bonus) or
 * wrong (penalty). Stored as data so the harness can add, remove and tune them.
 * Matched as regex sources against subtypes, order independent.
 */
export const SEED_RULES: RuleSpec[] = [
  { id: "seed-01-chelsea-boot_slim-jean", a: "chelsea-boot|ankle-boot", b: "slim-jean|straight-jean|slim-trouser", bonus: 0.12, reason: "slim legs sit cleanly over ankle boots", origin: "seed" },
  { id: "seed-02-combat-boot_jean", a: "combat-boot", b: "jean|cargo|mini-skirt|slip-dress", bonus: 0.1, reason: "combat boots toughen up the silhouette", origin: "seed" },
  { id: "seed-03-loafer_chino", a: "loafer", b: "chino|tailored|pleated|straight-jean|midi-skirt", bonus: 0.12, reason: "loafers are made for a tailored or cropped hem", origin: "seed" },
  { id: "seed-04-white-sneaker_jean", a: "white-sneaker|court-sneaker", b: "jean|chino|wide-leg|midi|slip-dress|tee|shirt-dress", bonus: 0.1, reason: "clean sneakers dress down anything", origin: "seed" },
  { id: "seed-05-running-shoe_jogger", a: "running-shoe|trainer", b: "jogger|legging|track|hoodie|sweat", bonus: 0.12, reason: "performance shoes match athletic separates", origin: "seed" },
  { id: "seed-06-stiletto_cocktail", a: "stiletto|pump|heeled", b: "cocktail|slip-dress|tailored|wide-leg-trouser|pencil|midi-skirt", bonus: 0.12, reason: "a heel lengthens the line of a dress or trouser", origin: "seed" },
  { id: "seed-07-strappy-sandal_linen", a: "strappy-sandal|slide", b: "linen|sundress|shorts|midi-skirt|maxi", bonus: 0.1, reason: "open sandals belong with warm-weather fabrics", origin: "seed" },
  { id: "seed-08-oxford_suit", a: "oxford|derby", b: "suit|tailored|chino|blazer|oxford-shirt", bonus: 0.12, reason: "lace-ups anchor tailoring", origin: "seed" },
  { id: "seed-09-hiking-boot_cargo", a: "hiking-boot", b: "cargo|flannel|jean|puffer|fleece", bonus: 0.1, reason: "rugged boots match outdoor layers", origin: "seed" },
  { id: "seed-10-stiletto_jogger", a: "stiletto|pump|oxford|derby", b: "jogger|legging|track|sweat|hoodie|athletic-short", bonus: -0.35, reason: "dress shoes clash with athletic wear", origin: "seed" },
  { id: "seed-11-running-shoe_suit", a: "running-shoe|trainer|slide", b: "suit|cocktail|gown|tailored-blazer", bonus: -0.35, reason: "athletic shoes undercut tailoring", origin: "seed" },
  { id: "seed-12-hiking-boot_gown", a: "hiking-boot|combat-boot", b: "gown|cocktail", bonus: -0.2, reason: "heavy boots fight a cocktail dress", origin: "seed" },
  { id: "seed-13-socks_stiletto", a: "socks", b: "stiletto|pump|sandal|slide|slip-dress|cocktail|sundress|maxi|midi-skirt|mini-skirt|shorts", bonus: -0.4, reason: "visible socks break the line", origin: "seed" },
  { id: "seed-14-running-shoe_sundress", a: "running-shoe", b: "sundress|slip-dress|midi-skirt|maxi|cocktail", bonus: -0.2, reason: "running shoes read gym, not dress", origin: "seed" },
  { id: "seed-15-clutch_cocktail", a: "clutch", b: "cocktail|gown|slip-dress|tailored", bonus: 0.08, reason: "a clutch finishes an evening look", origin: "seed" },
  { id: "seed-16-backpack_cocktail", a: "backpack|belt-bag", b: "cocktail|gown|suit", bonus: -0.25, reason: "a backpack breaks an evening look", origin: "seed" },
];

export const SEED_WEIGHTS: Weights = { color: 0.33, style: 0.3, formality: 0.27, season: 0.1 };
export const SEED_SCORING: ScoringPolicy = { weights: SEED_WEIGHTS, rules: SEED_RULES };

const compiled = new Map<string, { a: RegExp; b: RegExp }>();
function compile(r: RuleSpec) {
  const key = `${r.a}\u0000${r.b}`;
  let c = compiled.get(key);
  if (!c) {
    c = { a: new RegExp(r.a), b: new RegExp(r.b) };
    compiled.set(key, c);
  }
  return c;
}

export function genderCompatible(a: Gender, b: Gender): boolean {
  return a === "unisex" || b === "unisex" || a === b;
}

export function pairScore(a: Product, b: Product, scoring: ScoringPolicy = SEED_SCORING): PairScore {
  const reasons: string[] = [];

  const harmony = colorHarmony(a.color, b.color);
  reasons.push(harmony.reason);

  const st = styleScore(a.styles, b.styles);
  if (st.shared.length) reasons.push(`both ${st.shared.slice(0, 2).join(" / ")}`);

  const fDiff = Math.abs(a.formality - b.formality);
  const formality = Math.max(0, 1 - fDiff / 2.5);
  if (fDiff === 0) reasons.push("same dress code");

  const sharedSeason = a.seasons.some((s) => b.seasons.includes(s));
  const season = sharedSeason ? 1 : 0.3;

  let rule = 0;
  for (const spec of scoring.rules) {
    const r = compile(spec);
    const hit =
      (r.a.test(a.subtype) && r.b.test(b.subtype)) || (r.a.test(b.subtype) && r.b.test(a.subtype));
    if (hit && spec.bonus !== 0) {
      rule += spec.bonus;
      reasons.push(spec.reason);
    }
  }

  const w = scoring.weights;
  const wSum = w.color + w.style + w.formality + w.season || 1;
  let total = (w.color * harmony.score + w.style * st.score + w.formality * formality + w.season * season) / wSum + rule;
  if (!genderCompatible(a.gender, b.gender)) total = 0;
  total = Math.max(0, Math.min(1, total));

  return { total, color: harmony.score, style: st.score, formality, season, rule, reasons };
}
