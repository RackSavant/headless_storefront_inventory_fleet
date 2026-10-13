/** Loads inventory, the external catalog and store config from ./data (server only). */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ROLES, SEASONS, STYLES, type Product, type StoreConfig } from "@/lib/types";

const ProductSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["inventory", "external"]),
  title: z.string().min(1),
  brand: z.string().optional(),
  role: z.enum(ROLES),
  subtype: z.string().min(1),
  gender: z.enum(["women", "men", "unisex"]),
  color: z.object({ name: z.string(), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  styles: z.array(z.enum(STYLES)).min(1),
  formality: z.number().min(1).max(5),
  seasons: z.array(z.enum(SEASONS)).min(1),
  price_cents: z.number().int().nonnegative(),
  currency: z.enum(["USD", "USDC"]),
  image_url: z.string().optional(),
  image_credit: z
    .object({
      openverse_id: z.string().optional(),
      text: z.string(),
      creator: z.string().nullish(),
      license: z.string(),
      license_url: z.string().nullish(),
      source_url: z.string().nullish(),
    })
    .optional(),
  model_url: z.string().optional(),
  model_texture_url: z.string().optional(),
  model_rotation_y: z.number().optional(),
  sku: z.string().optional(),
  quantity: z.number().int().nonnegative().optional(),
  cost_cents: z.number().int().nonnegative().optional(),
  received_at: z.string().optional(),
  sizes: z.array(z.string()).optional(),
  retailer: z.string().optional(),
  url: z.string().optional(),
});

const ConfigSchema = z.object({
  store_name: z.string(),
  protect_inventory_roles: z.boolean(),
  protect_min_items: z.number().int().min(1),
  inventory_boost: z.number().min(0).max(0.5),
  slow_mover_days: z.number().int().positive(),
  bundle_discounts: z.record(z.string(), z.number().min(0).max(60)),
  slow_mover_extra_pct: z.number().min(0).max(30),
  min_margin_pct: z.number().min(0),
});

const DATA_DIR = path.join(process.cwd(), "data");

let cache: { key: string; inventory: Product[]; external: Product[]; config: StoreConfig } | null = null;

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8"));
}

/** Re-reads the files when they change, so importing new stock doesn't need a restart. */
export function loadCatalog() {
  const snapshot = path.join("..", ".data", "firebase-inventory.json");
  const inventoryFile = process.env.NODE_ENV !== "test" && existsSync(path.join(DATA_DIR, snapshot)) ? snapshot : "inventory.json";
  const files = [inventoryFile, "external-catalog.json", "store-config.json"];
  const key = files.map((f) => `${f}:${statSync(path.join(DATA_DIR, f)).mtimeMs}`).join(":");
  if (cache?.key === key) return cache;
  const inventory = z.array(ProductSchema).parse(readJson(files[0])) as Product[];
  const external = z.array(ProductSchema).parse(readJson(files[1])) as Product[];
  const config = ConfigSchema.parse(readJson(files[2])) as StoreConfig;
  cache = { key, inventory, external, config };
  return cache;
}

export function allProducts(): Product[] {
  const { inventory, external } = loadCatalog();
  return [...inventory, ...external];
}

export function getProducts(ids: string[]): Product[] {
  const byId = new Map(allProducts().map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Product => !!p);
}

export { ProductSchema };
