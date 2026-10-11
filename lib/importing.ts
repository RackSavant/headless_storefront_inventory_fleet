/** Shared by the import scripts: raw feed rows -> validated Product records. */
import { readFileSync, writeFileSync } from "node:fs";
import { ProductSchema } from "@/lib/catalog";
import { colorHex, findColor, inferFormality, inferGender, inferRoleSubtype, inferSeasons, inferStyles, slug } from "@/lib/tagging";
import { ROLES, SEASONS, STYLES, type Gender, type Product, type Role, type Season, type Style } from "@/lib/types";

export interface RawItem {
  id?: string;
  title: string;
  /** Extra text for tagging: product type, tags, description. */
  text?: string;
  color?: string;
  gender?: string;
  price_cents: number;
  role?: string;
  subtype?: string;
  styles?: string;
  formality?: number;
  seasons?: string;
  brand?: string;
  retailer?: string;
  url?: string;
  image_url?: string;
  model_url?: string;
  sku?: string;
  quantity?: number;
  cost_cents?: number;
  received_at?: string;
  sizes?: string[];
}

const list = <T extends string>(v: string | undefined, allowed: readonly T[]): T[] =>
  (v ?? "")
    .split(/[;|,]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x): x is T => (allowed as readonly string[]).includes(x));

export function toProduct(raw: RawItem, source: Product["source"], fallbackGender: Gender = "unisex"): Product | null {
  const text = `${raw.title} ${raw.text ?? ""}`;
  const explicitRole = list(raw.role, ROLES)[0] as Role | undefined;
  const inferred = inferRoleSubtype(raw.subtype ? `${raw.subtype} ${text}` : text);
  const role = explicitRole ?? inferred?.role;
  if (!role) return null;
  const subtype = raw.subtype ? slug(raw.subtype) : inferred?.role === role ? inferred.subtype : role;
  const colorName = (raw.color || findColor(text) || "grey").toLowerCase();
  const styles = list<Style>(raw.styles, STYLES);
  const seasons = list<Season>(raw.seasons, SEASONS);
  const g = (raw.gender ?? "").toLowerCase();
  const gender: Gender = g === "women" || g === "men" || g === "unisex" ? g : inferGender(`${raw.gender ?? ""} ${text}`, fallbackGender);

  const candidate: Product = {
    id: raw.id ?? `${source === "inventory" ? "inv" : "ext"}_${slug(`${raw.title} ${colorName}`)}`,
    source,
    title: raw.title,
    brand: raw.brand || undefined,
    role,
    subtype,
    gender,
    color: { name: colorName, hex: colorHex(colorName) },
    styles: styles.length ? styles : inferStyles(`${subtype} ${text}`),
    formality: raw.formality && raw.formality >= 1 && raw.formality <= 5 ? raw.formality : inferFormality(subtype),
    seasons: seasons.length ? seasons : inferSeasons(subtype, text),
    price_cents: Math.round(raw.price_cents),
    currency: "USD",
    image_url: raw.image_url || undefined,
    model_url: raw.model_url || undefined,
    sku: raw.sku || undefined,
    quantity: raw.quantity,
    cost_cents: raw.cost_cents,
    received_at: raw.received_at || undefined,
    sizes: raw.sizes?.length ? raw.sizes : undefined,
    retailer: raw.retailer || undefined,
    url: raw.url || undefined,
  };
  const parsed = ProductSchema.safeParse(JSON.parse(JSON.stringify(candidate)));
  return parsed.success ? (parsed.data as Product) : null;
}

/** Merge new products into a JSON catalog file by id (new wins), or replace it. */
export function writeCatalog(path: string, products: Product[], mode: "merge" | "replace") {
  let existing: Product[] = [];
  if (mode === "merge") {
    try {
      existing = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      existing = [];
    }
  }
  const byId = new Map(existing.map((p) => [p.id, p]));
  for (const p of products) byId.set(p.id, p);
  const out = [...byId.values()];
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
  return out.length;
}

export function args(argv: string[]) {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
      else flags[k] = "true";
    } else positional.push(a);
  }
  return { flags, positional };
}

export function summarize(products: Product[]) {
  const by = new Map<string, number>();
  for (const p of products) by.set(p.role, (by.get(p.role) ?? 0) + 1);
  return [...by.entries()].map(([r, n]) => `${r}: ${n}`).join(", ");
}
