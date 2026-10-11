/**
 * Shopper taste memory. Same idea as AstraCharm's rejection -> preference loop:
 * every like / dislike nudges weights, and a dislike reason ("too formal",
 * "not a fan of red") becomes a durable preference instead of a one-off skip.
 */
import { colorFamily } from "@/lib/color";
import { STYLES, type Product, type ShopperProfile, type Style } from "@/lib/types";

const LIMIT = 3;
const clip = (v: number) => Math.max(-LIMIT, Math.min(LIMIT, v));

export function emptyProfile(shopperId: string): ShopperProfile {
  return {
    shopper_id: shopperId,
    style_w: {},
    color_w: {},
    subtype_w: {},
    formality_bias: 0,
    liked_ids: [],
    disliked_ids: [],
    updated_at: new Date().toISOString(),
  };
}

/** Personal preference adjustment, roughly -0.15..0.15. */
export function profileScore(profile: ShopperProfile | null, p: Product): number {
  if (!profile) return 0;
  if (profile.disliked_ids.includes(p.id)) return -1;
  const style = p.styles.reduce((s, x) => s + (profile.style_w[x] ?? 0), 0) / Math.max(1, p.styles.length);
  const color = profile.color_w[colorFamily(p.color.name, p.color.hex)] ?? 0;
  const subtype = profile.subtype_w[p.subtype] ?? 0;
  const liked = profile.liked_ids.includes(p.id) ? 1 : 0;
  return 0.15 * Math.tanh(0.5 * style + 0.4 * color + 0.3 * subtype + liked);
}

export interface LearnedPreference {
  key: string;
  value: string;
  delta: number;
}

/** Turn a free-text dislike reason into durable preferences. Deterministic so it works offline. */
export function extractPreferences(reason: string, p: Product): LearnedPreference[] {
  const r = reason.toLowerCase();
  const out: LearnedPreference[] = [];
  if (/too (formal|dressy|fancy)|overdressed/.test(r)) out.push({ key: "formality", value: "lower", delta: -0.5 });
  if (/too (casual|sporty|basic)|underdressed/.test(r)) out.push({ key: "formality", value: "higher", delta: 0.5 });
  const COLORS = "red|pink|green|yellow|orange|purple|blue|black|white|brown|grey|gray|beige|navy|olive|denim";
  const named = r.match(new RegExp(`\\b(${COLORS})\\b`));
  const negative = /\b(hate|don'?t like|not a fan of|no more|avoid)\b/.test(r);
  if (/colou?r|shade|too (bright|loud)/.test(r) || (negative && named)) {
    const value = named ? (named[1] === "gray" ? "grey" : named[1]) : colorFamily(p.color.name, p.color.hex);
    out.push({ key: "color", value, delta: -1.5 });
  }
  for (const s of STYLES) {
    if (new RegExp(`(too|not|no|hate|don'?t like)[^.]*\\b${s}\\b`).test(r)) out.push({ key: "style", value: s, delta: -1 });
  }
  if (/(shape|cut|silhouette|style of|fit)/.test(r)) out.push({ key: "subtype", value: p.subtype, delta: -1 });
  return out;
}

export function applyFeedback(
  profile: ShopperProfile,
  p: Product,
  verdict: "like" | "dislike",
  reason?: string,
): { profile: ShopperProfile; learned: LearnedPreference[] } {
  const next: ShopperProfile = structuredClone(profile);
  const sign = verdict === "like" ? 1 : -1;
  const family = colorFamily(p.color.name, p.color.hex);

  for (const s of p.styles) next.style_w[s as Style] = clip((next.style_w[s as Style] ?? 0) + 0.4 * sign);
  next.color_w[family] = clip((next.color_w[family] ?? 0) + 0.3 * sign);
  next.subtype_w[p.subtype] = clip((next.subtype_w[p.subtype] ?? 0) + 0.3 * sign);

  const listAdd = verdict === "like" ? next.liked_ids : next.disliked_ids;
  const listDrop = verdict === "like" ? next.disliked_ids : next.liked_ids;
  if (!listAdd.includes(p.id)) listAdd.push(p.id);
  const i = listDrop.indexOf(p.id);
  if (i >= 0) listDrop.splice(i, 1);

  const learned = verdict === "dislike" && reason ? extractPreferences(reason, p) : [];
  for (const l of learned) {
    if (l.key === "formality") next.formality_bias = clip(next.formality_bias + l.delta);
    if (l.key === "color") next.color_w[l.value] = clip((next.color_w[l.value] ?? 0) + l.delta);
    if (l.key === "style") next.style_w[l.value as Style] = clip((next.style_w[l.value as Style] ?? 0) + l.delta);
    if (l.key === "subtype") next.subtype_w[l.value] = clip((next.subtype_w[l.value] ?? 0) + l.delta);
  }
  next.updated_at = new Date().toISOString();
  return { profile: next, learned };
}
