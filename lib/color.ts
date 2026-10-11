/**
 * Color harmony for outfits. Fashion treats some saturated colors (navy, denim,
 * camel, olive, cognac) as neutrals, so name-based neutrals win over pure HSL.
 */

const FASHION_NEUTRALS = [
  "black", "white", "ivory", "cream", "oat", "ecru", "beige", "stone", "sand", "khaki",
  "grey", "gray", "charcoal", "heather", "silver",
  "navy", "denim", "indigo", "camel", "tan", "cognac", "brown", "chocolate", "taupe",
  "olive", "nude", "gold", "straw", "tortoise", "champagne",
];

export interface HSL { h: number; s: number; l: number }

export function hexToHsl(hex: string): HSL {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

export function isNeutral(name: string, hex: string): boolean {
  const lower = name.toLowerCase();
  if (FASHION_NEUTRALS.some((n) => lower.includes(n))) return true;
  const { s, l } = hexToHsl(hex);
  return s < 0.15 || l < 0.12 || l > 0.93;
}

/** Coarse bucket used for personalization weights and demand signals. */
export function colorFamily(name: string, hex: string): string {
  const lower = name.toLowerCase();
  for (const n of ["black", "white", "navy", "denim", "grey", "beige", "brown", "olive"]) {
    if (lower.includes(n)) return n;
  }
  if (/(cream|ivory|oat|ecru|sand|stone|khaki|nude)/.test(lower)) return "beige";
  if (/(camel|tan|cognac|chocolate|taupe)/.test(lower)) return "brown";
  if (/(charcoal|heather|silver|gray)/.test(lower)) return "grey";
  if (/indigo/.test(lower)) return "denim";
  const { h, s, l } = hexToHsl(hex);
  if (s < 0.15) return l < 0.3 ? "black" : l > 0.85 ? "white" : "grey";
  if (h < 15 || h >= 345) return "red";
  if (h < 40) return "orange";
  if (h < 65) return "yellow";
  if (h < 160) return "green";
  if (h < 250) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export interface Harmony { score: number; reason: string }

export function colorHarmony(
  a: { name: string; hex: string },
  b: { name: string; hex: string },
): Harmony {
  const na = isNeutral(a.name, a.hex);
  const nb = isNeutral(b.name, b.hex);
  if (na && nb) {
    if (a.name.toLowerCase() === b.name.toLowerCase()) {
      return /denim/i.test(a.name)
        ? { score: 0.5, reason: `double denim in the same wash` }
        : { score: 0.8, reason: `tonal ${a.name}` };
    }
    const la = hexToHsl(a.hex).l;
    const lb = hexToHsl(b.hex).l;
    // Two near-identical dark neutrals (black + navy) read as a mismatch rather than tonal.
    if (la < 0.25 && lb < 0.25 && a.name.toLowerCase() !== b.name.toLowerCase()) {
      return { score: 0.6, reason: `${a.name} and ${b.name} are close dark neutrals` };
    }
    return { score: 0.82, reason: `${a.name} and ${b.name} are easy neutrals` };
  }
  if (na || nb) {
    const [neutral, pop] = na ? [a, b] : [b, a];
    return { score: 0.88, reason: `${neutral.name} grounds the ${pop.name}` };
  }
  const ha = hexToHsl(a.hex);
  const hb = hexToHsl(b.hex);
  const d = hueDistance(ha.h, hb.h);
  const loud = ha.s > 0.7 && hb.s > 0.7 && ha.l > 0.3 && hb.l > 0.3;
  if (d < 20) return { score: 0.78, reason: `tonal ${a.name} and ${b.name}` };
  if (d < 45) return { score: 0.74, reason: `${a.name} and ${b.name} sit next to each other on the color wheel` };
  if (d > 150) return { score: loud ? 0.55 : 0.72, reason: `${a.name} and ${b.name} are complementary` };
  if (d > 105 && d < 135) return { score: loud ? 0.45 : 0.58, reason: `${a.name} and ${b.name} make a triadic accent` };
  return { score: loud ? 0.25 : 0.38, reason: `${a.name} and ${b.name} compete` };
}
