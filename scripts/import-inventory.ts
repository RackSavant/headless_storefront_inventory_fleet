/**
 * Replace data/inventory.json with your stock sheet (export from Shopify, Square, a spreadsheet...).
 *
 *   npm run inventory:import -- my-stock.csv
 *
 * Required columns: title, price, quantity
 * Optional: sku, category (shoes|top|bottom|dress|outerwear|bag|accessory), subtype, color, gender,
 *           cost, received_at (YYYY-MM-DD), sizes (;-separated), styles (;-separated), formality (1-5),
 *           seasons (;-separated), model_url (GLB for the 3D store)
 * Anything missing is inferred from the title.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { args, summarize, toProduct, writeCatalog } from "../lib/importing";
import { parseCsv } from "../lib/tagging";
import type { Product } from "../lib/types";

const { flags, positional } = args(process.argv.slice(2));
const file = positional[0];
if (!file) {
  console.error("usage: npm run inventory:import -- <stock.csv> [--merge]");
  process.exit(1);
}
const money = (v: string | undefined) => (v ? Math.round(Number(v.replace(/[$,]/g, "")) * 100) : undefined);

const rows = parseCsv(readFileSync(file, "utf8"));
const products: Product[] = [];
const skipped: string[] = [];
for (const r of rows) {
  const p = toProduct(
    {
      id: r.sku ? `inv_${r.sku.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined,
      title: r.title,
      text: `${r.category ?? ""} ${r.description ?? ""}`,
      role: r.category,
      subtype: r.subtype,
      color: r.color,
      gender: r.gender,
      styles: r.styles,
      formality: r.formality ? Number(r.formality) : undefined,
      seasons: r.seasons,
      price_cents: money(r.price) ?? 0,
      cost_cents: money(r.cost),
      quantity: r.quantity ? Number(r.quantity) : 0,
      received_at: r.received_at ? new Date(r.received_at).toISOString() : undefined,
      sizes: r.sizes ? r.sizes.split(/[;|]/).map((s) => s.trim()).filter(Boolean) : undefined,
      sku: r.sku,
      model_url: r.model_url,
    },
    "inventory",
  );
  if (p) products.push(p);
  else skipped.push(r.title || "(no title)");
}

const out = flags.out ?? path.join(process.cwd(), "data", "inventory.json");
const total = writeCatalog(out, products, flags.merge ? "merge" : "replace");
console.log(`Imported ${products.length} items (${summarize(products)}) -> ${out} (${total} total).`);
if (skipped.length) console.log(`Skipped ${skipped.length} rows we couldn't categorize (add a category column): ${skipped.slice(0, 5).join(", ")}`);
