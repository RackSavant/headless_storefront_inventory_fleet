/**
 * Real product photos for the catalog from Openverse (openverse.org): openly
 * licensed photographs, commercial use allowed (CC0, public domain, CC BY,
 * CC BY-SA). Each photo's attribution is stored on the product and shown in
 * the app, as the licenses require.
 *
 *   npm run photos:fetch                # all products without a photo
 *   npm run photos:fetch -- --only inventory
 *   npm run photos:fetch -- --redo inv_leather-chelsea-boots
 *
 * One search per item type (cached in .data/openverse-cache.json), then each
 * product picks the best match for its color, preferring clean product shots
 * over photos of people. data/photo-overrides.json pins a specific Openverse
 * image id for a product, or "none" to keep the 3D render.
 * Anonymous Openverse limits: 20 requests/minute, 200/day.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { colorFamily } from "../lib/color";
import type { Product } from "../lib/types";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const OUT = path.join(ROOT, "public", "photos");
const CACHE = path.join(ROOT, ".data", "openverse-cache.json");
const OVERRIDES = path.join(DATA, "photo-overrides.json");
const API = "https://api.openverse.org/v1/images/";
const LICENSES = "cc0,pdm,by,by-sa";
const UA = "racksavant-store/0.1 (catalog photos; openverse api)";

const NOUN: Record<string, string> = {
  "chelsea-boot": "chelsea boots", "combat-boot": "combat boots", "white-sneaker": "white sneakers", trainer: "suede sneakers",
  "running-shoe": "running shoes", loafer: "loafers", stiletto: "stiletto heels", pump: "pumps heels", "strappy-sandal": "strappy sandals",
  slide: "slide sandals", oxford: "oxford shoes", derby: "derby shoes", "hiking-boot": "hiking boots", "canvas-sneaker": "canvas sneakers",
  "ankle-boot": "ankle boots", crossbody: "crossbody bag", tote: "tote bag", clutch: "clutch bag", backpack: "backpack", "belt-bag": "belt bag",
  socks: "socks", belt: "leather belt", scarf: "scarf", beanie: "beanie", cap: "baseball cap", sunglasses: "sunglasses", necklace: "gold necklace",
  watch: "wristwatch", "sun-hat": "straw hat", tee: "t-shirt", "oxford-shirt": "button down shirt", "silk-camisole": "camisole",
  "ribbed-knit-top": "knit top", hoodie: "hoodie", "linen-shirt": "linen shirt", "cashmere-sweater": "sweater", "peasant-blouse": "blouse",
  polo: "polo shirt", tank: "tank top", "band-tee": "band t-shirt", "slim-jean": "jeans", "straight-jean": "jeans", "wide-leg-trouser": "wide leg trousers",
  chino: "chinos", "tailored-trouser": "trousers", jogger: "joggers", "cargo-pant": "cargo pants", "midi-skirt": "midi skirt", "mini-skirt": "mini skirt",
  "linen-shorts": "shorts", "athletic-short": "running shorts", legging: "leggings", "slip-dress": "slip dress", "cocktail-dress": "cocktail dress",
  sundress: "sundress", "shirt-dress": "shirt dress", "knit-midi-dress": "knit dress", "maxi-dress": "maxi dress", "denim-jacket": "denim jacket",
  "leather-jacket": "leather jacket", "trench-coat": "trench coat", "wool-coat": "wool coat", "tailored-blazer": "blazer", puffer: "puffer jacket",
  fleece: "fleece jacket", cardigan: "cardigan", bomber: "bomber jacket",
};

// Words that suggest a photo of people / scenes rather than the product.
const PEOPLE = /\b(girl|woman|women|man|men|boy|lady|model|wearing|outfit|look|street ?style|portrait|selfie|people|couple|festival|wedding|bride|runway|fashion week|party|concert|cosplay|kid|child|baby|dog)\b/i;

interface OvImage {
  id: string;
  title: string;
  url: string;
  width: number;
  height: number;
  license: string;
  license_version: string;
  license_url: string;
  creator: string;
  creator_url: string;
  foreign_landing_url: string;
  attribution: string;
  tags: Array<{ name: string }>;
  mature: boolean;
}

const cache: Record<string, OvImage[]> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const overrides: Record<string, string> = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, "utf8")) : {};
let lastRequest = 0;

async function search(q: string): Promise<OvImage[]> {
  if (cache[q]) return cache[q];
  const wait = 3300 - (Date.now() - lastRequest); // stay under 20/min
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const url = `${API}?q=${encodeURIComponent(q)}&license=${LICENSES}&page_size=20&mature=false`;
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (res.status === 429) throw new Error("Openverse rate limit reached (200/day anonymous). Run again tomorrow; finished products are kept.");
  if (!res.ok) throw new Error(`Openverse ${res.status} for "${q}"`);
  const body = (await res.json()) as { results: OvImage[] };
  cache[q] = body.results.filter((r) => !r.mature);
  mkdirSync(path.dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache));
  return cache[q];
}

async function byId(id: string): Promise<OvImage | null> {
  const key = `id:${id}`;
  if (cache[key]) return cache[key][0];
  const res = await fetch(`${API}${id}/`, { headers: { "user-agent": UA } });
  if (!res.ok) return null;
  const img = (await res.json()) as OvImage;
  cache[key] = [img];
  writeFileSync(CACHE, JSON.stringify(cache));
  return img;
}

function colorWords(p: Product): string[] {
  const fam = colorFamily(p.color.name, p.color.hex);
  return [...new Set([...p.color.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && w !== "wash"), fam])];
}

function score(img: OvImage, p: Product, used: Map<string, number>): number {
  const text = `${img.title} ${img.tags?.map((t) => t.name).join(" ") ?? ""}`.toLowerCase();
  const noun = NOUN[p.subtype] ?? p.subtype;
  let s = 0;
  if (noun.split(" ").every((w) => text.includes(w.replace(/s$/, "")))) s += 3;
  if (colorWords(p).some((c) => new RegExp(`\\b${c}\\b`).test(text))) s += 3;
  if (PEOPLE.test(text)) s -= 4;
  const ar = img.width / Math.max(1, img.height);
  if (ar > 0.65 && ar < 1.6) s += 1;
  if (img.width >= 700) s += 1;
  s -= 3 * (used.get(img.id) ?? 0);
  return s;
}

async function download(img: OvImage, id: string): Promise<string> {
  mkdirSync(OUT, { recursive: true });
  const res = await fetch(img.url, { headers: { "user-agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const tmp = path.join(OUT, `${id}.download`);
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  const file = path.join(OUT, `${id}.jpg`);
  // Normalize to a ≤900px JPEG (macOS sips); fall back to the original bytes elsewhere.
  const r = spawnSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "900", tmp, "--out", file]);
  if (r.status !== 0) writeFileSync(file, readFileSync(tmp));
  spawnSync("rm", ["-f", tmp]);
  return `/photos/${id}.jpg`;
}

async function main() {
  const argv = process.argv.slice(2);
  const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
  const redo = new Set(argv.includes("--redo") ? argv.slice(argv.indexOf("--redo") + 1).filter((a) => !a.startsWith("--")) : []);
  const files = ["inventory.json", "external-catalog.json"].filter((f) => !only || f.startsWith(only === "inventory" ? "inventory" : "external"));
  const used = new Map<string, number>();
  let done = 0;
  let skipped = 0;

  for (const f of files) {
    const file = path.join(DATA, f);
    const products = JSON.parse(readFileSync(file, "utf8")) as Product[];
    for (const p of products) if (p.image_credit?.openverse_id) used.set(p.image_credit.openverse_id, (used.get(p.image_credit.openverse_id) ?? 0) + 1);
    for (const p of products) {
      if (p.image_url && !redo.has(p.id) && p.image_credit) continue;
      const pin = overrides[p.id];
      if (pin === "none") {
        delete p.image_url;
        delete p.image_credit;
        skipped++;
        continue;
      }
      let img: OvImage | null = null;
      if (pin) img = await byId(pin);
      else {
        const noun = NOUN[p.subtype] ?? p.subtype.replace(/-/g, " ");
        let pool = await search(noun);
        // The store's own stock deserves a color-specific search when the shared pool has no color match.
        if (p.source === "inventory" && !pool.some((r) => score(r, p, used) >= 6)) pool = [...(await search(`${colorWords(p)[0]} ${noun}`)), ...pool];
        const ranked = pool.map((r) => ({ r, s: score(r, p, used) })).sort((a, b) => b.s - a.s);
        img = ranked[0] && ranked[0].s >= 1 ? ranked[0].r : null;
      }
      if (!img) {
        console.log(`  no good photo for ${p.id}, keeping the 3D render`);
        skipped++;
        continue;
      }
      try {
        p.image_url = await download(img, p.id);
        p.image_credit = {
          openverse_id: img.id,
          text: img.attribution,
          creator: img.creator || undefined,
          license: `${img.license.toUpperCase()} ${img.license_version}`.trim(),
          license_url: img.license_url,
          source_url: img.foreign_landing_url,
        };
        used.set(img.id, (used.get(img.id) ?? 0) + 1);
        done++;
        console.log(`  ${p.id} <- "${img.title}" (${p.image_credit.license}, ${img.creator})`);
      } catch (e) {
        console.log(`  ${p.id}: download failed (${e instanceof Error ? e.message : e}); keeping the 3D render`);
        skipped++;
      }
      writeFileSync(file, JSON.stringify(products, null, 2) + "\n");
    }
  }
  console.log(`\n${done} photos added, ${skipped} kept as 3D renders. Review them at /catalog; pin or reject in data/photo-overrides.json.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
