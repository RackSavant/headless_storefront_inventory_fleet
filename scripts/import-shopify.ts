/**
 * Pull a partner's catalog from a Shopify store's public /products.json feed
 * into data/external-catalog.json. Use it for stores you have a relationship
 * with (affiliate / partner agreement) and check their terms first.
 *
 *   npm run catalog:shopify -- partner-store.com other-partner.com
 *   npm run catalog:shopify -- --file saved-products.json --retailer "Partner Co"
 *
 * Flags: --out <path> (default data/external-catalog.json), --replace, --max-pages <n> (default 4),
 *        --gender women|men|unisex (fallback when the feed doesn't say), --per-product-colors <n> (default 3)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { args, summarize, toProduct, writeCatalog, type RawItem } from "../lib/importing";
import { slug } from "../lib/tagging";
import type { Gender, Product } from "../lib/types";

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor?: string;
  product_type?: string;
  tags?: string[] | string;
  body_html?: string;
  options?: Array<{ name: string; values: string[] }>;
  variants?: Array<{ price: string; available?: boolean; option1?: string | null; option2?: string | null; option3?: string | null }>;
  images?: Array<{ src: string }>;
}

const { flags, positional } = args(process.argv.slice(2));
const out = flags.out ?? path.join(process.cwd(), "data", "external-catalog.json");
const maxPages = Number(flags["max-pages"] ?? 4);
const colorsPerProduct = Number(flags["per-product-colors"] ?? 3);
const fallbackGender = (flags.gender as Gender) ?? "unisex";

function mapProducts(items: ShopifyProduct[], domain: string | null, retailer: string): Product[] {
  const out: Product[] = [];
  for (const sp of items) {
    const variants = (sp.variants ?? []).filter((v) => v.available !== false);
    if (!variants.length) continue;
    const tags = Array.isArray(sp.tags) ? sp.tags.join(" ") : (sp.tags ?? "");
    const text = `${sp.product_type ?? ""} ${tags} ${(sp.body_html ?? "").replace(/<[^>]+>/g, " ").slice(0, 400)}`;
    const colorOpt = (sp.options ?? []).findIndex((o) => /colou?r/i.test(o.name));
    const colors = colorOpt >= 0 ? sp.options![colorOpt].values.slice(0, colorsPerProduct) : [undefined];
    for (const color of colors) {
      const key = (["option1", "option2", "option3"] as const)[colorOpt];
      const forColor = color && key ? variants.filter((v) => v[key] === color) : variants;
      if (!forColor.length) continue;
      const price = Math.min(...forColor.map((v) => Number(v.price))) * 100;
      const raw: RawItem = {
        id: `ext_${slug(domain ?? retailer)}_${sp.id}${color ? `_${slug(color)}` : ""}`,
        title: color && !sp.title.toLowerCase().includes(color.toLowerCase()) ? `${sp.title} · ${color}` : sp.title,
        text,
        color,
        brand: sp.vendor,
        price_cents: price,
        retailer,
        url: domain ? `https://${domain}/products/${sp.handle}` : undefined,
        image_url: sp.images?.[0]?.src,
      };
      const p = toProduct(raw, "external", fallbackGender);
      if (p) out.push(p);
    }
  }
  return out;
}

async function fetchStore(domain: string): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://${domain}/products.json?limit=250&page=${page}`;
    const res = await fetch(url, { headers: { "user-agent": "racksavant-store-catalog-import/0.1 (partner catalog sync)" } });
    if (!res.ok) {
      console.warn(`  ${url} -> HTTP ${res.status}, stopping`);
      break;
    }
    const body = (await res.json()) as { products?: ShopifyProduct[] };
    const batch = body.products ?? [];
    all.push(...batch);
    console.log(`  ${domain} page ${page}: ${batch.length} products`);
    if (batch.length < 250) break;
    await new Promise((r) => setTimeout(r, 1200)); // be polite
  }
  return all;
}

async function main() {
  const products: Product[] = [];
  if (flags.file) {
    const body = JSON.parse(readFileSync(flags.file, "utf8")) as { products?: ShopifyProduct[] };
    products.push(...mapProducts(body.products ?? [], flags.domain ?? null, flags.retailer ?? "Partner"));
  }
  for (const domain of positional) {
    console.log(`Fetching ${domain}…`);
    const items = await fetchStore(domain.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
    products.push(...mapProducts(items, domain, flags.retailer ?? domain));
  }
  if (!products.length) {
    console.error("Nothing imported. Pass Shopify domains or --file products.json");
    process.exit(1);
  }
  const total = writeCatalog(out, products, flags.replace ? "replace" : "merge");
  console.log(`Imported ${products.length} (${summarize(products)}). ${out} now has ${total} items.`);
}

main();
