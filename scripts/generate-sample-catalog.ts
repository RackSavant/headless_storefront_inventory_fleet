/**
 * Writes the sample data the app ships with:
 *   data/inventory.json         a shoe store's stock (replace with yours: npm run inventory:import)
 *   data/external-catalog.json  generic "what goes with it" items (replace with scraped data:
 *                               npm run catalog:shopify / npm run catalog:csv)
 *
 * External items carry no brand and link to a shopping search for the item,
 * so nothing here pretends to be a real retailer's listing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Gender, Product, Role, Season, Style } from "../lib/types";

const ALL: Season[] = ["spring", "summer", "fall", "winter"];
const C = {
  white: "#f4f2ee", black: "#1c1c1e", "heather grey": "#a7a9ac", olive: "#5f6b3a", "light blue": "#a9c4e4",
  champagne: "#e8d5b5", emerald: "#1f6f50", oat: "#d9cbb0", burgundy: "#6d1f2b", sage: "#9caf88",
  sand: "#d6c4a0", "sky blue": "#8db8dc", camel: "#b98a52", charcoal: "#3d3f43", cream: "#efe6d2",
  ivory: "#f3ecdc", terracotta: "#c4623f", navy: "#1f2a44", "forest green": "#2f4f3a", cobalt: "#1f4fd1",
  "washed black": "#2b2b2b", "indigo denim": "#2e3f63", "black denim": "#2a2c30", "light wash denim": "#8fb0cf",
  ecru: "#e9dfc7", khaki: "#b9a77c", stone: "#bdb3a1", chocolate: "#4a2f23", crimson: "#b3202a",
  "buttercup yellow": "#e8c547", "blush pink": "#e8b4b8", rust: "#a5492b", cognac: "#8a4b26",
  mustard: "#c9a227", silver: "#c0c4c8", gold: "#d4af37", tortoise: "#5a3a22", straw: "#d9c08a",
  "cherry red": "#8b1a1a", "chocolate brown": "#4a2f23", tan: "#c19a6b", nude: "#d8b49a", taupe: "#8b7d6b",
} as const;
type ColorName = keyof typeof C;

interface Base {
  role: Role; subtype: string; title: string; gender: Gender; styles: Style[];
  formality: number; seasons: Season[]; price: number; colors: ColorName[];
}

const EXTERNAL: Base[] = [
  // tops
  { role: "top", subtype: "tee", title: "Heavyweight Crew Tee", gender: "unisex", styles: ["casual", "minimal", "streetwear"], formality: 2, seasons: ALL, price: 28, colors: ["white", "black", "heather grey", "olive"] },
  { role: "top", subtype: "oxford-shirt", title: "Oxford Button-Down Shirt", gender: "men", styles: ["classic", "preppy"], formality: 3, seasons: ALL, price: 58, colors: ["light blue", "white"] },
  { role: "top", subtype: "silk-camisole", title: "Silk Camisole", gender: "women", styles: ["romantic", "minimal", "formal"], formality: 4, seasons: ["spring", "summer", "fall"], price: 78, colors: ["champagne", "black", "emerald"] },
  { role: "top", subtype: "ribbed-knit-top", title: "Ribbed Mock-Neck Knit", gender: "women", styles: ["minimal", "classic"], formality: 3, seasons: ["fall", "winter", "spring"], price: 48, colors: ["oat", "black", "burgundy"] },
  { role: "top", subtype: "hoodie", title: "Fleece Pullover Hoodie", gender: "unisex", styles: ["streetwear", "athleisure", "casual"], formality: 1, seasons: ["fall", "winter", "spring"], price: 64, colors: ["heather grey", "black", "sage"] },
  { role: "top", subtype: "linen-shirt", title: "Relaxed Linen Shirt", gender: "unisex", styles: ["casual", "boho", "minimal"], formality: 2, seasons: ["spring", "summer"], price: 68, colors: ["white", "sand", "sky blue"] },
  { role: "top", subtype: "cashmere-sweater", title: "Cashmere Crewneck Sweater", gender: "unisex", styles: ["classic", "minimal"], formality: 3, seasons: ["fall", "winter"], price: 140, colors: ["camel", "charcoal", "cream"] },
  { role: "top", subtype: "peasant-blouse", title: "Embroidered Peasant Blouse", gender: "women", styles: ["boho", "romantic"], formality: 2, seasons: ["spring", "summer"], price: 54, colors: ["ivory", "terracotta"] },
  { role: "top", subtype: "polo", title: "Knit Polo", gender: "men", styles: ["preppy", "classic", "casual"], formality: 3, seasons: ["spring", "summer"], price: 60, colors: ["navy", "cream", "forest green"] },
  { role: "top", subtype: "tank", title: "Performance Tank", gender: "unisex", styles: ["athleisure"], formality: 1, seasons: ["spring", "summer"], price: 32, colors: ["black", "cobalt"] },
  { role: "top", subtype: "band-tee", title: "Vintage Band Tee", gender: "unisex", styles: ["edgy", "streetwear"], formality: 2, seasons: ALL, price: 38, colors: ["washed black"] },
  // bottoms
  { role: "bottom", subtype: "slim-jean", title: "Slim Selvedge Jeans", gender: "unisex", styles: ["casual", "classic", "edgy"], formality: 2, seasons: ALL, price: 98, colors: ["indigo denim", "black denim"] },
  { role: "bottom", subtype: "straight-jean", title: "Straight-Leg Jeans", gender: "women", styles: ["casual", "classic"], formality: 2, seasons: ALL, price: 88, colors: ["light wash denim", "ecru"] },
  { role: "bottom", subtype: "wide-leg-trouser", title: "Pleated Wide-Leg Trousers", gender: "women", styles: ["minimal", "classic", "formal"], formality: 4, seasons: ["spring", "fall", "winter"], price: 110, colors: ["black", "cream", "charcoal"] },
  { role: "bottom", subtype: "chino", title: "Slim Chinos", gender: "men", styles: ["preppy", "classic", "casual"], formality: 3, seasons: ["spring", "summer", "fall"], price: 68, colors: ["khaki", "navy", "olive"] },
  { role: "bottom", subtype: "tailored-trouser", title: "Tailored Wool Trousers", gender: "men", styles: ["formal", "classic", "minimal"], formality: 4, seasons: ["fall", "winter", "spring"], price: 150, colors: ["charcoal", "navy"] },
  { role: "bottom", subtype: "jogger", title: "Fleece Joggers", gender: "unisex", styles: ["athleisure", "streetwear"], formality: 1, seasons: ["fall", "winter", "spring"], price: 58, colors: ["heather grey", "black"] },
  { role: "bottom", subtype: "cargo-pant", title: "Utility Cargo Pants", gender: "unisex", styles: ["streetwear", "edgy", "casual"], formality: 2, seasons: ["spring", "fall"], price: 84, colors: ["olive", "black", "stone"] },
  { role: "bottom", subtype: "midi-skirt", title: "Satin Midi Skirt", gender: "women", styles: ["romantic", "minimal", "formal"], formality: 4, seasons: ["spring", "summer", "fall"], price: 88, colors: ["champagne", "black", "sage"] },
  { role: "bottom", subtype: "mini-skirt", title: "Leather Mini Skirt", gender: "women", styles: ["edgy"], formality: 3, seasons: ["fall", "winter", "spring"], price: 96, colors: ["black", "chocolate"] },
  { role: "bottom", subtype: "linen-shorts", title: "Linen Drawstring Shorts", gender: "unisex", styles: ["casual", "boho"], formality: 2, seasons: ["summer"], price: 45, colors: ["sand", "white", "navy"] },
  { role: "bottom", subtype: "athletic-short", title: "Running Shorts", gender: "unisex", styles: ["athleisure"], formality: 1, seasons: ["spring", "summer"], price: 40, colors: ["black", "navy"] },
  { role: "bottom", subtype: "legging", title: "High-Rise Leggings", gender: "women", styles: ["athleisure"], formality: 1, seasons: ALL, price: 68, colors: ["black", "chocolate"] },
  // dresses
  { role: "dress", subtype: "slip-dress", title: "Bias-Cut Slip Dress", gender: "women", styles: ["romantic", "minimal", "formal"], formality: 4, seasons: ["spring", "summer", "fall"], price: 128, colors: ["black", "champagne", "emerald"] },
  { role: "dress", subtype: "cocktail-dress", title: "Structured Cocktail Dress", gender: "women", styles: ["formal", "classic"], formality: 5, seasons: ALL, price: 190, colors: ["black", "crimson", "navy"] },
  { role: "dress", subtype: "sundress", title: "Floral Cotton Sundress", gender: "women", styles: ["boho", "romantic", "casual"], formality: 2, seasons: ["summer", "spring"], price: 78, colors: ["buttercup yellow", "blush pink"] },
  { role: "dress", subtype: "shirt-dress", title: "Poplin Shirt Dress", gender: "women", styles: ["classic", "preppy", "minimal"], formality: 3, seasons: ["spring", "summer", "fall"], price: 98, colors: ["white", "light blue", "khaki"] },
  { role: "dress", subtype: "knit-midi-dress", title: "Ribbed Knit Midi Dress", gender: "women", styles: ["minimal", "casual"], formality: 3, seasons: ["fall", "winter"], price: 110, colors: ["oat", "charcoal", "rust"] },
  { role: "dress", subtype: "maxi-dress", title: "Tiered Maxi Dress", gender: "women", styles: ["boho"], formality: 2, seasons: ["summer"], price: 118, colors: ["terracotta", "ivory"] },
  // outerwear
  { role: "outerwear", subtype: "denim-jacket", title: "Trucker Denim Jacket", gender: "unisex", styles: ["casual", "streetwear", "classic"], formality: 2, seasons: ["spring", "fall"], price: 98, colors: ["indigo denim", "black denim"] },
  { role: "outerwear", subtype: "leather-jacket", title: "Leather Moto Jacket", gender: "unisex", styles: ["edgy", "streetwear"], formality: 3, seasons: ["spring", "fall"], price: 320, colors: ["black", "cognac"] },
  { role: "outerwear", subtype: "trench-coat", title: "Classic Trench Coat", gender: "unisex", styles: ["classic", "minimal", "preppy"], formality: 4, seasons: ["spring", "fall"], price: 240, colors: ["stone", "navy"] },
  { role: "outerwear", subtype: "wool-coat", title: "Wool Overcoat", gender: "unisex", styles: ["classic", "minimal", "formal"], formality: 4, seasons: ["fall", "winter"], price: 280, colors: ["camel", "charcoal", "black"] },
  { role: "outerwear", subtype: "tailored-blazer", title: "Tailored Blazer", gender: "unisex", styles: ["classic", "formal", "minimal"], formality: 4, seasons: ["spring", "fall", "winter"], price: 190, colors: ["navy", "black", "oat"] },
  { role: "outerwear", subtype: "puffer", title: "Puffer Jacket", gender: "unisex", styles: ["streetwear", "athleisure", "casual"], formality: 1, seasons: ["winter"], price: 180, colors: ["black", "olive"] },
  { role: "outerwear", subtype: "fleece", title: "Sherpa Fleece Jacket", gender: "unisex", styles: ["casual", "athleisure"], formality: 2, seasons: ["fall", "winter"], price: 110, colors: ["cream", "chocolate"] },
  { role: "outerwear", subtype: "cardigan", title: "Chunky Cardigan", gender: "women", styles: ["romantic", "boho", "casual"], formality: 2, seasons: ["fall", "winter"], price: 88, colors: ["cream", "mustard"] },
  { role: "outerwear", subtype: "bomber", title: "Satin Bomber Jacket", gender: "unisex", styles: ["streetwear"], formality: 2, seasons: ["spring", "fall"], price: 120, colors: ["olive", "black"] },
  // bags
  { role: "bag", subtype: "tote", title: "Leather Tote", gender: "women", styles: ["classic", "minimal"], formality: 3, seasons: ALL, price: 180, colors: ["cognac", "black"] },
  { role: "bag", subtype: "crossbody", title: "Mini Crossbody", gender: "women", styles: ["casual", "minimal", "romantic"], formality: 3, seasons: ALL, price: 120, colors: ["black", "cream", "crimson"] },
  { role: "bag", subtype: "clutch", title: "Satin Clutch", gender: "women", styles: ["formal", "romantic"], formality: 5, seasons: ALL, price: 90, colors: ["black", "champagne", "silver"] },
  { role: "bag", subtype: "backpack", title: "Nylon Backpack", gender: "unisex", styles: ["streetwear", "athleisure", "casual"], formality: 1, seasons: ALL, price: 95, colors: ["black", "olive"] },
  { role: "bag", subtype: "belt-bag", title: "Belt Bag", gender: "unisex", styles: ["streetwear", "athleisure"], formality: 1, seasons: ALL, price: 55, colors: ["black", "sage"] },
  // accessories
  { role: "accessory", subtype: "scarf", title: "Wool Scarf", gender: "unisex", styles: ["classic", "minimal", "casual"], formality: 2, seasons: ["fall", "winter"], price: 65, colors: ["camel", "heather grey", "burgundy"] },
  { role: "accessory", subtype: "beanie", title: "Rib Beanie", gender: "unisex", styles: ["streetwear", "casual"], formality: 1, seasons: ["fall", "winter"], price: 28, colors: ["black", "oat", "forest green"] },
  { role: "accessory", subtype: "cap", title: "Cotton Cap", gender: "unisex", styles: ["streetwear", "athleisure", "casual"], formality: 1, seasons: ["spring", "summer", "fall"], price: 30, colors: ["navy", "white"] },
  { role: "accessory", subtype: "sunglasses", title: "Acetate Sunglasses", gender: "unisex", styles: ["classic", "minimal", "edgy"], formality: 3, seasons: ["spring", "summer"], price: 120, colors: ["tortoise", "black"] },
  { role: "accessory", subtype: "necklace", title: "Gold Chain Necklace", gender: "women", styles: ["minimal", "romantic", "formal"], formality: 4, seasons: ALL, price: 85, colors: ["gold"] },
  { role: "accessory", subtype: "watch", title: "Steel Watch", gender: "unisex", styles: ["classic", "minimal"], formality: 3, seasons: ALL, price: 210, colors: ["silver"] },
  { role: "accessory", subtype: "sun-hat", title: "Straw Sun Hat", gender: "women", styles: ["boho"], formality: 2, seasons: ["summer"], price: 48, colors: ["straw"] },
  // shoes (only used by stores that don't sell shoes themselves)
  { role: "shoes", subtype: "white-sneaker", title: "Leather Low-Top Sneaker", gender: "unisex", styles: ["casual", "minimal", "streetwear"], formality: 2, seasons: ALL, price: 110, colors: ["white"] },
  { role: "shoes", subtype: "loafer", title: "Classic Loafer", gender: "unisex", styles: ["classic", "preppy"], formality: 3, seasons: ALL, price: 160, colors: ["black"] },
  { role: "shoes", subtype: "strappy-sandal", title: "Strappy Heeled Sandal", gender: "women", styles: ["romantic", "formal"], formality: 4, seasons: ["summer", "spring"], price: 110, colors: ["champagne"] },
  { role: "shoes", subtype: "chelsea-boot", title: "Suede Chelsea Boot", gender: "unisex", styles: ["classic", "edgy"], formality: 3, seasons: ["fall", "winter"], price: 190, colors: ["chocolate"] },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

const external: Product[] = EXTERNAL.flatMap((b) =>
  b.colors.map((color, i) => {
    const title = b.title.toLowerCase().includes(color) ? b.title : `${cap(color)} ${b.title}`;
    return {
      id: `ext_${slug(b.subtype)}_${slug(color)}`,
      source: "external" as const,
      title,
      role: b.role,
      subtype: b.subtype,
      gender: b.gender,
      color: { name: color, hex: C[color] },
      styles: b.styles,
      formality: b.formality,
      seasons: b.seasons,
      price_cents: (b.price + i * 4) * 100,
      currency: "USD" as const,
      retailer: "Partner catalog (sample)",
      url: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(title)}`,
    };
  }),
);

type Inv = Omit<Base, "colors" | "price"> & { color: ColorName; price: number; cost: number; qty: number; received: string; sizes: string[] };
const W = ["6", "7", "8", "9", "10"];
const M = ["8", "9", "10", "11", "12"];
const U = ["6", "7", "8", "9", "10", "11", "12"];
const INVENTORY: Inv[] = [
  { role: "shoes", subtype: "chelsea-boot", title: "Leather Chelsea Boots", gender: "unisex", color: "chocolate brown", styles: ["classic", "edgy", "casual"], formality: 3, seasons: ["fall", "winter", "spring"], price: 189, cost: 82, qty: 6, received: "2026-05-02", sizes: U },
  { role: "shoes", subtype: "combat-boot", title: "Cherry Red Combat Boots", gender: "unisex", color: "cherry red", styles: ["edgy", "streetwear"], formality: 2, seasons: ["fall", "winter", "spring"], price: 165, cost: 70, qty: 3, received: "2026-08-20", sizes: U },
  { role: "shoes", subtype: "white-sneaker", title: "White Leather Court Sneakers", gender: "unisex", color: "white", styles: ["minimal", "casual", "streetwear"], formality: 2, seasons: ALL, price: 120, cost: 45, qty: 14, received: "2026-09-15", sizes: U },
  { role: "shoes", subtype: "trainer", title: "Retro Suede Trainers", gender: "unisex", color: "forest green", styles: ["streetwear", "casual", "athleisure"], formality: 2, seasons: ["spring", "summer", "fall"], price: 110, cost: 44, qty: 8, received: "2026-04-10", sizes: U },
  { role: "shoes", subtype: "running-shoe", title: "Performance Running Shoes", gender: "unisex", color: "black", styles: ["athleisure"], formality: 1, seasons: ALL, price: 140, cost: 60, qty: 5, received: "2026-09-01", sizes: U },
  { role: "shoes", subtype: "loafer", title: "Penny Loafers", gender: "unisex", color: "black", styles: ["classic", "preppy", "minimal"], formality: 3, seasons: ALL, price: 175, cost: 70, qty: 4, received: "2026-07-01", sizes: U },
  { role: "shoes", subtype: "loafer", title: "Suede Tassel Loafers", gender: "men", color: "tan", styles: ["preppy", "classic"], formality: 3, seasons: ["spring", "summer", "fall"], price: 160, cost: 65, qty: 7, received: "2026-03-15", sizes: M },
  { role: "shoes", subtype: "stiletto", title: "Nude Crisscross Stilettos", gender: "women", color: "nude", styles: ["formal", "romantic"], formality: 5, seasons: ["spring", "summer", "fall"], price: 150, cost: 55, qty: 5, received: "2026-06-01", sizes: W },
  { role: "shoes", subtype: "pump", title: "Black Pointed Pumps", gender: "women", color: "black", styles: ["formal", "classic", "minimal"], formality: 4, seasons: ALL, price: 140, cost: 50, qty: 6, received: "2026-08-05", sizes: W },
  { role: "shoes", subtype: "strappy-sandal", title: "Strappy Block-Heel Sandals", gender: "women", color: "champagne", styles: ["romantic", "boho"], formality: 3, seasons: ["spring", "summer"], price: 120, cost: 44, qty: 9, received: "2026-05-20", sizes: W },
  { role: "shoes", subtype: "slide", title: "Leather Slides", gender: "unisex", color: "cognac", styles: ["casual", "boho", "minimal"], formality: 2, seasons: ["summer", "spring"], price: 85, cost: 30, qty: 10, received: "2026-06-10", sizes: U },
  { role: "shoes", subtype: "oxford", title: "Cap-Toe Oxfords", gender: "men", color: "black", styles: ["formal", "classic"], formality: 4, seasons: ALL, price: 210, cost: 85, qty: 3, received: "2026-09-20", sizes: M },
  { role: "shoes", subtype: "derby", title: "Brown Derby Shoes", gender: "men", color: "chocolate", styles: ["classic", "preppy"], formality: 4, seasons: ["fall", "winter", "spring"], price: 195, cost: 80, qty: 4, received: "2026-07-15", sizes: M },
  { role: "shoes", subtype: "hiking-boot", title: "Waterproof Hiking Boots", gender: "unisex", color: "olive", styles: ["casual", "athleisure"], formality: 1, seasons: ["fall", "winter", "spring"], price: 170, cost: 75, qty: 5, received: "2026-09-25", sizes: U },
  { role: "shoes", subtype: "canvas-sneaker", title: "Platform Canvas Sneakers", gender: "unisex", color: "cream", styles: ["casual", "streetwear", "boho"], formality: 2, seasons: ["spring", "summer", "fall"], price: 75, cost: 25, qty: 12, received: "2026-02-10", sizes: U },
  { role: "shoes", subtype: "ankle-boot", title: "Suede Ankle Boots", gender: "women", color: "taupe", styles: ["classic", "minimal", "boho"], formality: 3, seasons: ["fall", "winter"], price: 165, cost: 66, qty: 4, received: "2026-09-10", sizes: W },
  { role: "bag", subtype: "crossbody", title: "Leather Crossbody Bag", gender: "women", color: "cognac", styles: ["classic", "casual", "minimal"], formality: 3, seasons: ALL, price: 135, cost: 50, qty: 5, received: "2026-06-15", sizes: ["One size"] },
  { role: "bag", subtype: "tote", title: "Canvas Weekender Tote", gender: "unisex", color: "ecru", styles: ["casual", "minimal", "boho"], formality: 2, seasons: ALL, price: 95, cost: 30, qty: 7, received: "2026-04-01", sizes: ["One size"] },
  { role: "accessory", subtype: "socks", title: "Merino Crew Socks (3-Pack)", gender: "unisex", color: "charcoal", styles: ["casual", "classic", "minimal"], formality: 2, seasons: ["fall", "winter", "spring"], price: 24, cost: 8, qty: 40, received: "2026-08-01", sizes: ["S/M", "L/XL"] },
  { role: "accessory", subtype: "belt", title: "Leather Belt", gender: "unisex", color: "chocolate", styles: ["classic", "casual"], formality: 3, seasons: ALL, price: 60, cost: 20, qty: 8, received: "2026-05-05", sizes: ["30", "32", "34", "36"] },
];

const inventory: Product[] = INVENTORY.map((b, i) => ({
  id: `inv_${slug(b.title)}`,
  source: "inventory",
  sku: `RS-${String(i + 1).padStart(3, "0")}`,
  title: b.title,
  role: b.role,
  subtype: b.subtype,
  gender: b.gender,
  color: { name: b.color, hex: C[b.color] },
  styles: b.styles,
  formality: b.formality,
  seasons: b.seasons,
  price_cents: b.price * 100,
  cost_cents: b.cost * 100,
  currency: "USD",
  quantity: b.qty,
  received_at: `${b.received}T00:00:00.000Z`,
  sizes: b.sizes,
}));

// Real 3D asset for the demo stiletto (from the spatialintelligence repo); others use procedural models.
const stiletto = inventory.find((p) => p.id === "inv_nude-crisscross-stilettos");
if (stiletto) {
  stiletto.model_url = "/models/nude-crisscross-stiletto/stiletto.fbx";
  stiletto.model_texture_url = "/models/nude-crisscross-stiletto/texture.jpg";
}

const out = path.join(process.cwd(), "data");
const force = process.argv.includes("--force");
const read = (f: string): Product[] => {
  try {
    return JSON.parse(readFileSync(path.join(out, f), "utf8"));
  } catch {
    return [];
  }
};

// Keep curated photos on regeneration: inventory photos carry over by id, and the
// partner catalog (rebuilt around real photos) is only replaced with --force.
const prevInv = new Map(read("inventory.json").map((p) => [p.id, p]));
for (const p of inventory) {
  const prev = prevInv.get(p.id);
  if (prev?.image_url) Object.assign(p, { image_url: prev.image_url, image_credit: prev.image_credit });
}
writeFileSync(path.join(out, "inventory.json"), JSON.stringify(inventory, null, 2) + "\n");
const curated = read("external-catalog.json").some((p) => p.image_url);
if (curated && !force) console.log("external-catalog.json has curated photos; left as is (pass --force to regenerate it)");
else writeFileSync(path.join(out, "external-catalog.json"), JSON.stringify(external, null, 2) + "\n");
console.log(`inventory: ${inventory.length} items, external catalog: ${curated && !force ? "kept" : external.length + " items"}`);
