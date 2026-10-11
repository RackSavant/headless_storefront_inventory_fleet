/**
 * Import a pre-scraped / open fashion dataset CSV as the external catalog.
 * Defaults match the H&M Personalized Fashion Recommendations dataset
 * (Kaggle, articles.csv); point the --*-col flags at other feeds' columns.
 *
 *   npm run catalog:csv -- articles.csv --limit-per-type 4
 *   npm run catalog:csv -- feed.csv --title-col name --type-col category --color-col colour --price-col price --url-col link
 *
 * articles.csv has no prices: pass --price-col, or prices are estimated from formality (marked in the retailer field).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { args, summarize, toProduct, writeCatalog } from "../lib/importing";
import { parseCsv, slug } from "../lib/tagging";
import type { Product } from "../lib/types";

const { flags, positional } = args(process.argv.slice(2));
const file = positional[0];
if (!file) {
  console.error("usage: npm run catalog:csv -- <file.csv> [--title-col] [--type-col] [--color-col] [--gender-col] [--price-col] [--url-col] [--image-col] [--id-col]");
  process.exit(1);
}
const col = (name: string, fallback: string) => flags[`${name}-col`] ?? fallback;
const C = {
  id: col("id", "article_id"),
  title: col("title", "prod_name"),
  type: col("type", "product_type_name"),
  group: col("group", "garment_group_name"),
  color: col("color", "colour_group_name"),
  gender: col("gender", "index_group_name"),
  desc: col("desc", "detail_desc"),
  price: col("price", "price"),
  url: col("url", "url"),
  image: col("image", "image_url"),
};
const perType = Number(flags["limit-per-type"] ?? 6);
const retailer = flags.retailer ?? "Partner catalog";
const out = flags.out ?? path.join(process.cwd(), "data", "external-catalog.json");

const rows = parseCsv(readFileSync(file, "utf8"));
const counts = new Map<string, number>();
const products: Product[] = [];
for (const r of rows) {
  const title = r[C.title];
  if (!title) continue;
  const gender = /ladies|women|female/i.test(r[C.gender] ?? "") ? "women" : /men/i.test(r[C.gender] ?? "") ? "men" : r[C.gender];
  const priceRaw = Number(r[C.price]);
  const p = toProduct(
    {
      id: r[C.id] ? `ext_${slug(retailer)}_${r[C.id]}` : undefined,
      title: r[C.color] && !title.toLowerCase().includes(r[C.color].toLowerCase()) ? `${r[C.color]} ${title}` : title,
      text: `${r[C.type] ?? ""} ${r[C.group] ?? ""} ${r[C.desc] ?? ""}`,
      color: r[C.color],
      gender,
      price_cents: Number.isFinite(priceRaw) && priceRaw > 0 ? Math.round(priceRaw * (priceRaw < 5 ? 10000 : 100)) : 0,
      retailer,
      url: r[C.url] || `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(title)}`,
      image_url: r[C.image],
    },
    "external",
  );
  if (!p) continue;
  if (!p.price_cents) {
    p.price_cents = (25 + p.formality * 30) * 100; // estimate; feed had no price
    p.retailer = `${retailer} (est. price)`;
  }
  // Keep the catalog varied instead of 4,000 near-identical tees.
  const key = `${p.subtype}|${p.color.name}|${p.gender}`;
  if ((counts.get(key) ?? 0) >= perType) continue;
  counts.set(key, (counts.get(key) ?? 0) + 1);
  products.push(p);
}

const total = writeCatalog(out, products, flags.replace ? "replace" : "merge");
console.log(`Read ${rows.length} rows, imported ${products.length} (${summarize(products)}). ${out} now has ${total} items.`);
