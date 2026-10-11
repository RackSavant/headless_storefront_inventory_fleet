import { colorHarmony } from "@/lib/color";
import type { Gender, PairScore, Product, Style } from "@/lib/types";

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
 * wrong (penalty). Matched with substring patterns, order independent.
 */
const PAIRING_RULES: Array<{ a: RegExp; b: RegExp; bonus: number; reason: string }> = [
  { a: /chelsea-boot|ankle-boot/, b: /slim-jean|straight-jean|slim-trouser/, bonus: 0.12, reason: "slim legs sit cleanly over ankle boots" },
  { a: /combat-boot/, b: /jean|cargo|mini-skirt|slip-dress/, bonus: 0.1, reason: "combat boots toughen up the silhouette" },
  { a: /loafer/, b: /chino|tailored|pleated|straight-jean|midi-skirt/, bonus: 0.12, reason: "loafers are made for a tailored or cropped hem" },
  { a: /white-sneaker|court-sneaker/, b: /jean|chino|wide-leg|midi|slip-dress|tee|shirt-dress/, bonus: 0.1, reason: "clean sneakers dress down anything" },
  { a: /running-shoe|trainer/, b: /jogger|legging|track|hoodie|sweat/, bonus: 0.12, reason: "performance shoes match athletic separates" },
  { a: /stiletto|pump|heeled/, b: /cocktail|slip-dress|tailored|wide-leg-trouser|pencil|midi-skirt/, bonus: 0.12, reason: "a heel lengthens the line of a dress or trouser" },
  { a: /strappy-sandal|slide/, b: /linen|sundress|shorts|midi-skirt|maxi/, bonus: 0.1, reason: "open sandals belong with warm-weather fabrics" },
  { a: /oxford|derby/, b: /suit|tailored|chino|blazer|oxford-shirt/, bonus: 0.12, reason: "lace-ups anchor tailoring" },
  { a: /hiking-boot/, b: /cargo|flannel|jean|puffer|fleece/, bonus: 0.1, reason: "rugged boots match outdoor layers" },
  { a: /stiletto|pump|oxford|derby/, b: /jogger|legging|track|sweat|hoodie|athletic-short/, bonus: -0.35, reason: "dress shoes clash with athletic wear" },
  { a: /running-shoe|trainer|slide/, b: /suit|cocktail|gown|tailored-blazer/, bonus: -0.35, reason: "athletic shoes undercut tailoring" },
  { a: /hiking-boot|combat-boot/, b: /gown|cocktail/, bonus: -0.2, reason: "heavy boots fight a cocktail dress" },
  { a: /socks/, b: /stiletto|pump|sandal|slide|slip-dress|cocktail|sundress|maxi|midi-skirt|mini-skirt|shorts/, bonus: -0.4, reason: "visible socks break the line" },
  { a: /running-shoe/, b: /sundress|slip-dress|midi-skirt|maxi|cocktail/, bonus: -0.2, reason: "running shoes read gym, not dress" },
  { a: /clutch/, b: /cocktail|gown|slip-dress|tailored/, bonus: 0.08, reason: "a clutch finishes an evening look" },
  { a: /backpack|belt-bag/, b: /cocktail|gown|suit/, bonus: -0.25, reason: "a backpack breaks an evening look" },
];

export function genderCompatible(a: Gender, b: Gender): boolean {
  return a === "unisex" || b === "unisex" || a === b;
}

export function pairScore(a: Product, b: Product): PairScore {
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
  for (const r of PAIRING_RULES) {
    const hit =
      (r.a.test(a.subtype) && r.b.test(b.subtype)) || (r.a.test(b.subtype) && r.b.test(a.subtype));
    if (hit && r.bonus !== 0) {
      rule += r.bonus;
      reasons.push(r.reason);
    }
  }

  let total = 0.33 * harmony.score + 0.3 * st.score + 0.27 * formality + 0.1 * season + rule;
  if (!genderCompatible(a.gender, b.gender)) total = 0;
  total = Math.max(0, Math.min(1, total));

  return { total, color: harmony.score, style: st.score, formality, season, rule, reasons };
}
