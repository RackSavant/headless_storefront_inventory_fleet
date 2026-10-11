export const ROLES = ["top", "bottom", "dress", "outerwear", "shoes", "bag", "accessory"] as const;
export type Role = (typeof ROLES)[number];

export const STYLES = [
  "casual",
  "streetwear",
  "minimal",
  "classic",
  "formal",
  "athleisure",
  "boho",
  "edgy",
  "preppy",
  "romantic",
] as const;
export type Style = (typeof STYLES)[number];

export const SEASONS = ["spring", "summer", "fall", "winter"] as const;
export type Season = (typeof SEASONS)[number];

export type Gender = "women" | "men" | "unisex";

export interface Product {
  id: string;
  /** "inventory" = you own and sell it. "external" = pre-scraped / partner catalog, recommended but not stocked. */
  source: "inventory" | "external";
  title: string;
  brand?: string;
  role: Role;
  /** Finer type that drives the 3D shape and pairing rules: sneaker, chelsea-boot, wide-leg-trouser, ... */
  subtype: string;
  gender: Gender;
  color: { name: string; hex: string };
  styles: Style[];
  /** 1 = gym/lounge, 2 = casual, 3 = smart casual, 4 = business / cocktail, 5 = black tie */
  formality: number;
  seasons: Season[];
  price_cents: number;
  currency: "USD";
  image_url?: string;
  /** Optional GLB; the store falls back to a procedural model when absent. */
  model_url?: string;

  // inventory-only
  sku?: string;
  quantity?: number;
  cost_cents?: number;
  /** ISO date the stock arrived; drives slow-mover detection. */
  received_at?: string;
  sizes?: string[];

  // external-only
  retailer?: string;
  url?: string;
}

export interface ShopperContext {
  gender?: Gender;
  /** Target formality 1..5 parsed from an occasion. */
  formality?: number;
  season?: Season;
  styles?: Style[];
  budget_cents?: number;
  occasion?: string;
}

export interface ShopperProfile {
  shopper_id: string;
  style_w: Partial<Record<Style, number>>;
  color_w: Record<string, number>;
  subtype_w: Record<string, number>;
  /** Positive = likes dressier looks than asked, negative = more relaxed. */
  formality_bias: number;
  liked_ids: string[];
  disliked_ids: string[];
  updated_at: string;
}

export interface PairScore {
  total: number;
  color: number;
  style: number;
  formality: number;
  season: number;
  rule: number;
  reasons: string[];
}

export interface LookItem {
  product: Product;
  /** Why this item is in the look, shopper-facing. */
  reasons: string[];
  /** Owner-facing only: why the engine pushed this inventory item. */
  merch_note?: string;
}

export interface Look {
  id: string;
  title: string;
  template: "separates" | "dress";
  items: LookItem[];
  /** Ranking score (includes merchandising boosts). */
  score: number;
  /** Pure style compatibility of the outfit, 0..1 — what the shopper sees as "match". */
  compat: number;
  blurb: string;
  bundle: Bundle | null;
  external_total_cents: number;
}

export interface Bundle {
  product_ids: string[];
  list_cents: number;
  price_cents: number;
  discount_pct: number;
  label: string;
}

export interface StoreConfig {
  store_name: string;
  /** Don't send shoppers to other retailers for categories you stock... */
  protect_inventory_roles: boolean;
  /** ...once you carry at least this many in-stock items in the category. */
  protect_min_items: number;
  /** Score bonus given to in-stock items so bundles move your inventory. */
  inventory_boost: number;
  slow_mover_days: number;
  /** Bundle discount by number of in-store items in the bundle. */
  bundle_discounts: Record<string, number>;
  slow_mover_extra_pct: number;
  /** Discounts never push an item below cost * (1 + this). */
  min_margin_pct: number;
}

export type EventType =
  | "view_item"
  | "try_on"
  | "look_shown"
  | "external_click"
  | "bundle_add"
  | "add_to_cart"
  | "like"
  | "dislike"
  | "checkout";

export interface StoreEvent {
  type: EventType;
  shopper_id: string;
  product_id?: string;
  product_ids?: string[];
  look_id?: string;
  reason?: string;
  value_cents?: number;
  ts: string;
}
