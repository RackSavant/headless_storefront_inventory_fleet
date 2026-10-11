/**
 * Free-text occasion -> ShopperContext. The keyword parser always runs and
 * works offline; lib/llm.ts can refine it with Claude when a key is set.
 */
import type { Season, ShopperContext, Style } from "@/lib/types";

const OCCASIONS: Array<{ re: RegExp; label: string; formality: number; styles?: Style[] }> = [
  { re: /black[- ]tie|gala|ball\b/, label: "Black tie", formality: 5, styles: ["formal"] },
  { re: /wedding|cocktail|opera|formal/, label: "Wedding guest", formality: 4, styles: ["formal", "romantic", "classic"] },
  { re: /interview|office|work|meeting|business|presentation/, label: "Office", formality: 4, styles: ["classic", "minimal"] },
  { re: /date|dinner|drinks|restaurant|night out|party/, label: "Dinner & drinks", formality: 3, styles: ["minimal", "romantic", "edgy"] },
  { re: /brunch|weekend|errands|coffee|everyday|school|campus/, label: "Weekend", formality: 2, styles: ["casual", "minimal"] },
  { re: /concert|festival|gig|show/, label: "Concert", formality: 2, styles: ["edgy", "streetwear", "boho"] },
  { re: /beach|vacation|holiday|resort|pool/, label: "Vacation", formality: 2, styles: ["boho", "casual"] },
  { re: /gym|run|workout|training|hike|hiking|yoga|sport/, label: "Active", formality: 1, styles: ["athleisure"] },
  { re: /travel|airport|flight|road trip/, label: "Travel day", formality: 2, styles: ["casual", "athleisure", "minimal"] },
];

const SEASON_WORDS: Array<[RegExp, Season]> = [
  [/summer|june|july|august|hot|heat|beach/, "summer"],
  [/winter|december|january|february|snow|cold|christmas|holiday party/, "winter"],
  [/spring|march|april|may\b/, "spring"],
  [/fall|autumn|september|october|november|halloween|thanksgiving/, "fall"],
];

export function parseOccasion(text: string): ShopperContext {
  const t = text.toLowerCase();
  const ctx: ShopperContext = {};
  const occ = OCCASIONS.find((o) => o.re.test(t));
  if (occ) {
    ctx.occasion = occ.label;
    ctx.formality = occ.formality;
    ctx.styles = occ.styles;
  }
  const season = SEASON_WORDS.find(([re]) => re.test(t));
  if (season) ctx.season = season[1];
  const budget = t.match(/(?:under|below|less than|max|budget(?: of)?)\s*\$?\s*(\d{2,5})/) ?? t.match(/\$(\d{2,5})/);
  if (budget) ctx.budget_cents = Number(budget[1]) * 100;
  if (/\b(men'?s|for him|guy|man)\b/.test(t)) ctx.gender = "men";
  if (/\b(women'?s|for her|woman|girl)\b/.test(t)) ctx.gender = "women";
  return ctx;
}

export function currentSeason(now = new Date()): Season {
  const m = now.getMonth();
  return m < 2 || m === 11 ? "winter" : m < 5 ? "spring" : m < 8 ? "summer" : "fall";
}
