/**
 * Turns raw product text (title, product type, tags, color option) into the
 * attributes the recommender needs. Used by every importer, so a scraped
 * Shopify feed, a Kaggle CSV and your own stock sheet all land in one schema.
 * Rules are ordered: the first match wins.
 */
import type { Gender, Role, Season, Style } from "@/lib/types";

const SUBTYPES: Array<[RegExp, Role, string]> = [
  // clothing that borrows shoe words ("running shorts", "trainer socks", "bootcut jeans")
  [/running short|gym short|athletic short|training short/, "bottom", "athletic-short"],
  [/sock/, "accessory", "socks"],
  [/boot ?cut|flare jean/, "bottom", "straight-jean"],
  [/shoe bag|boot bag/, "bag", "tote"],
  // shoes
  [/chelsea/, "shoes", "chelsea-boot"],
  [/combat|lace[- ]up boot|doc martens?|1460/, "shoes", "combat-boot"],
  [/hiking|trail boot/, "shoes", "hiking-boot"],
  [/ankle boot|bootie/, "shoes", "ankle-boot"],
  [/stiletto/, "shoes", "stiletto"],
  [/pump|court shoe|slingback/, "shoes", "pump"],
  [/sandal|espadrille/, "shoes", "strappy-sandal"],
  [/slide|flip[- ]flop|mule/, "shoes", "slide"],
  [/loafer|moccasin/, "shoes", "loafer"],
  [/oxford shoe|cap[- ]toe|brogue/, "shoes", "oxford"],
  [/derby/, "shoes", "derby"],
  [/running|runner|trainer|racer/, "shoes", "running-shoe"],
  [/canvas sneaker|platform sneaker|chuck|plimsoll/, "shoes", "canvas-sneaker"],
  [/sneaker|tennis shoe|court/, "shoes", "white-sneaker"],
  [/\bboots?\b/, "shoes", "ankle-boot"],
  [/\bheels?\b/, "shoes", "pump"],
  [/\bshoes?\b|footwear/, "shoes", "white-sneaker"],
  // dresses (before tops/bottoms: "shirt dress" is a dress)
  [/slip dress/, "dress", "slip-dress"],
  [/cocktail|evening dress|gown/, "dress", "cocktail-dress"],
  [/shirt ?dress/, "dress", "shirt-dress"],
  [/maxi/, "dress", "maxi-dress"],
  [/knit(ted)? dress|sweater dress|midi dress/, "dress", "knit-midi-dress"],
  [/sun ?dress|\bdress\b|jumpsuit/, "dress", "sundress"],
  // outerwear
  [/trench/, "outerwear", "trench-coat"],
  [/overcoat|wool coat|\bcoat\b|parka/, "outerwear", "wool-coat"],
  [/puffer|down jacket|padded/, "outerwear", "puffer"],
  [/leather jacket|biker|moto/, "outerwear", "leather-jacket"],
  [/denim jacket|trucker|jean jacket/, "outerwear", "denim-jacket"],
  [/blazer|sport coat|suit jacket/, "outerwear", "tailored-blazer"],
  [/bomber/, "outerwear", "bomber"],
  [/fleece|sherpa/, "outerwear", "fleece"],
  [/cardigan/, "outerwear", "cardigan"],
  [/jacket|anorak|windbreaker|overshirt|shacket/, "outerwear", "bomber"],
  // bottoms
  [/legging|tights/, "bottom", "legging"],
  [/jogger|sweatpant|track pant/, "bottom", "jogger"],
  [/shorts?\b/, "bottom", "linen-shorts"],
  [/mini skirt|miniskirt/, "bottom", "mini-skirt"],
  [/skirt/, "bottom", "midi-skirt"],
  [/cargo/, "bottom", "cargo-pant"],
  [/wide[- ]leg|palazzo|pleated trouser/, "bottom", "wide-leg-trouser"],
  [/chino|khaki pant/, "bottom", "chino"],
  [/straight[- ]leg|mom jean|boyfriend|relaxed jean/, "bottom", "straight-jean"],
  [/jean|denim pant/, "bottom", "slim-jean"],
  [/trouser|suit pant|slacks|dress pant/, "bottom", "tailored-trouser"],
  [/\bpants?\b|bottoms?/, "bottom", "chino"],
  // tops
  [/hoodie|sweatshirt|crewneck sweat/, "top", "hoodie"],
  [/cami|camisole/, "top", "silk-camisole"],
  [/\btank\b|vest top|singlet/, "top", "tank"],
  [/polo/, "top", "polo"],
  [/band tee|graphic tee|graphic t/, "top", "band-tee"],
  [/linen shirt/, "top", "linen-shirt"],
  [/t-shirt|tee\b/, "top", "tee"],
  [/oxford|button[- ]down|button[- ]up|\bshirt\b/, "top", "oxford-shirt"],
  [/blouse|peasant/, "top", "peasant-blouse"],
  [/cashmere|sweater|jumper|pullover/, "top", "cashmere-sweater"],
  [/knit|turtleneck|mock[- ]neck|ribbed top/, "top", "ribbed-knit-top"],
  [/\btop\b/, "top", "tee"],
  // bags
  [/clutch/, "bag", "clutch"],
  [/backpack|rucksack/, "bag", "backpack"],
  [/belt bag|bum bag|fanny|sling bag/, "bag", "belt-bag"],
  [/crossbody|cross-body|shoulder bag|saddle/, "bag", "crossbody"],
  [/tote|shopper|weekender|duffel|\bbag\b|handbag|purse/, "bag", "tote"],
  // accessories
  [/\bbelt\b/, "accessory", "belt"],
  [/scarf|shawl/, "accessory", "scarf"],
  [/beanie/, "accessory", "beanie"],
  [/\bcap\b|baseball hat/, "accessory", "cap"],
  [/sun ?hat|straw hat|bucket hat|\bhat\b/, "accessory", "sun-hat"],
  [/sunglass|eyewear/, "accessory", "sunglasses"],
  [/necklace|pendant|chain/, "accessory", "necklace"],
  [/watch/, "accessory", "watch"],
];

/** Things a feed may contain that never belong in a styled outfit. */
const NOT_OUTFIT = /\b(bra|bralette|underwear|briefs?|boxers?|lingerie|nightwear|pyjama|pajama|swim|bikini|gift card|shoe care|cleaner|laces)\b/;

export function inferRoleSubtype(text: string): { role: Role; subtype: string } | null {
  const t = ` ${text.toLowerCase()} `;
  if (NOT_OUTFIT.test(t)) return null;
  for (const [re, role, subtype] of SUBTYPES) if (re.test(t)) return { role, subtype };
  return null;
}

const COLORS: Record<string, string> = {
  black: "#1c1c1e", white: "#f4f2ee", "off white": "#efe9dc", ivory: "#f3ecdc", cream: "#efe6d2", ecru: "#e9dfc7",
  oat: "#d9cbb0", beige: "#d8c8a8", sand: "#d6c4a0", stone: "#bdb3a1", khaki: "#b9a77c", taupe: "#8b7d6b",
  camel: "#b98a52", tan: "#c19a6b", cognac: "#8a4b26", brown: "#5c3a24", chocolate: "#4a2f23", nude: "#d8b49a",
  grey: "#8e9094", gray: "#8e9094", charcoal: "#3d3f43", silver: "#c0c4c8", gold: "#d4af37",
  navy: "#1f2a44", denim: "#2e3f63", indigo: "#2e3f63", blue: "#2f5fa7", "light blue": "#a9c4e4", "sky blue": "#8db8dc", cobalt: "#1f4fd1",
  green: "#3b7a4a", olive: "#5f6b3a", sage: "#9caf88", khaki_green: "#6b6b3a", forest: "#2f4f3a", emerald: "#1f6f50", mint: "#a8d8c0",
  red: "#b3202a", burgundy: "#6d1f2b", wine: "#5e1a26", maroon: "#5e1a26", rust: "#a5492b", terracotta: "#c4623f",
  orange: "#e07b2e", yellow: "#e8c547", mustard: "#c9a227", pink: "#e8a3b5", blush: "#e8b4b8", "hot pink": "#e0457b",
  purple: "#6b4c9a", lilac: "#c3b1e1", lavender: "#c3b1e1", champagne: "#e8d5b5", multi: "#9a8f80",
};

/** Best-effort hex for a color name ("Washed Black", "Light wash denim", "Forest green"). */
export function colorHex(name: string): string {
  const n = name.toLowerCase();
  const exact = COLORS[n];
  if (exact) return exact;
  // longest key contained in the name wins: "light blue" beats "blue"
  const hit = Object.keys(COLORS)
    .filter((k) => n.includes(k.replace("_", " ")))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? COLORS[hit] : "#8e9094";
}

const STYLE_WORDS: Array<[RegExp, Style]> = [
  [/athletic|performance|running|gym|sport|yoga|track|jogger|legging/, "athleisure"],
  [/street|graphic|oversized|cargo|hoodie|bomber|skate|chunky/, "streetwear"],
  [/tailored|suit|blazer|silk|satin|cocktail|evening|pleated|heel|stiletto|pump|oxford|derby/, "formal"],
  [/classic|trench|oxford|loafer|cashmere|wool|chelsea|polo|button/, "classic"],
  [/minimal|clean|essential|basic|ribbed|crew/, "minimal"],
  [/leather|moto|biker|combat|studded|band|distressed|mini skirt/, "edgy"],
  [/floral|peasant|embroidered|crochet|maxi|fringe|straw|linen|tiered/, "boho"],
  [/ruffle|lace|bow|slip|blush|romantic|puff/, "romantic"],
  [/preppy|polo|chino|loafer|cable|varsity|oxford shirt/, "preppy"],
  [/tee|jean|denim|sneaker|casual|sweat|short/, "casual"],
];

export function inferStyles(text: string): Style[] {
  const t = text.toLowerCase();
  const out = STYLE_WORDS.filter(([re]) => re.test(t)).map(([, s]) => s);
  return out.length ? [...new Set(out)].slice(0, 3) : ["casual"];
}

const FORMALITY: Record<string, number> = {
  "running-shoe": 1, "hiking-boot": 1, jogger: 1, legging: 1, "athletic-short": 1, tank: 1, hoodie: 1, puffer: 1, backpack: 1, "belt-bag": 1, beanie: 1, cap: 1,
  "white-sneaker": 2, "canvas-sneaker": 2, trainer: 2, slide: 2, "combat-boot": 2, tee: 2, "band-tee": 2, "linen-shirt": 2, "peasant-blouse": 2,
  "slim-jean": 2, "straight-jean": 2, "cargo-pant": 2, "linen-shorts": 2, sundress: 2, "maxi-dress": 2, "denim-jacket": 2, bomber: 2, fleece: 2, cardigan: 2, tote: 2, socks: 2, scarf: 2, "sun-hat": 2,
  "chelsea-boot": 3, "ankle-boot": 3, loafer: 3, "strappy-sandal": 3, "oxford-shirt": 3, polo: 3, "cashmere-sweater": 3, "ribbed-knit-top": 3, chino: 3, "mini-skirt": 3,
  "shirt-dress": 3, "knit-midi-dress": 3, "leather-jacket": 3, crossbody: 3, belt: 3, sunglasses: 3, watch: 3,
  pump: 4, oxford: 4, derby: 4, "silk-camisole": 4, "wide-leg-trouser": 4, "tailored-trouser": 4, "midi-skirt": 4, "slip-dress": 4, "trench-coat": 4, "wool-coat": 4, "tailored-blazer": 4, necklace: 4,
  stiletto: 5, "cocktail-dress": 5, clutch: 5,
};

export function inferFormality(subtype: string): number {
  return FORMALITY[subtype] ?? 2;
}

export function inferSeasons(subtype: string, text: string): Season[] {
  const t = text.toLowerCase();
  if (/wool|cashmere|puffer|down|fleece|sherpa|beanie|scarf|knit|corduroy|flannel/.test(t) || ["puffer", "wool-coat", "fleece", "cardigan", "beanie", "scarf", "cashmere-sweater"].includes(subtype))
    return ["fall", "winter"];
  if (/linen|sandal|straw|short|swim|tank|slide|sundress|maxi/.test(t) || ["strappy-sandal", "slide", "linen-shorts", "sundress", "maxi-dress", "sun-hat", "tank"].includes(subtype))
    return ["spring", "summer"];
  if (/boot/.test(subtype)) return ["fall", "winter", "spring"];
  return ["spring", "summer", "fall", "winter"];
}

export function inferGender(text: string, fallback: Gender = "unisex"): Gender {
  const t = ` ${text.toLowerCase()} `;
  if (/\b(women'?s?|womens|ladies|ladieswear|female|her)\b/.test(t)) return "women";
  if (/\b(men'?s?|mens|menswear|male|his)\b/.test(t)) return "men";
  return fallback;
}

/** Finds a color word in free text when the feed has no color field. */
export function findColor(text: string): string | null {
  const t = text.toLowerCase();
  const hit = Object.keys(COLORS)
    .map((k) => k.replace("_", " "))
    .filter((k) => new RegExp(`\\b${k}\\b`).test(t))
    .sort((a, b) => b.length - a.length)[0];
  return hit ?? null;
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
