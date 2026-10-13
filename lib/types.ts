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
  currency: "USD" | "USDC";
  image_url?: string;
  /** Required attribution for openly licensed photos (see scripts/fetch-photos.ts). */
  image_credit?: {
    openverse_id?: string;
    text: string;
    creator?: string | null;
    license: string;
    license_url?: string | null;
    source_url?: string | null;
  };
  /** Optional GLB or FBX; the store falls back to a procedural model when absent. */
  model_url?: string;
  /** Texture to use for the model (when the file's own texture path is missing or too large). */
  model_texture_url?: string;
  /** Yaw so the model's toe/front faces +z like the procedural ones. */
  model_rotation_y?: number;

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
  currency?: Product["currency"];
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
  currency?: Product["currency"];
  ts: string;
}

/** Pair-score weights. Evolvable by the harness (lib/harness). */
export interface Weights {
  color: number;
  style: number;
  formality: number;
  season: number;
}

/** A stylist pairing rule as data: `a`/`b` are regex sources matched against subtypes. */
export interface RuleSpec {
  id: string;
  a: string;
  b: string;
  bonus: number;
  reason: string;
  origin: "seed" | "agent" | "human";
}

/** Store features the policy can switch on and off. */
export const ENGINE_TOOLS = ["partner_catalog", "bundle_discounts", "slow_mover_push", "llm_copy"] as const;
export type EngineTool = (typeof ENGINE_TOOLS)[number];

/** Everything about scoring and store features that a policy controls. */
export interface ScoringPolicy {
  weights: Weights;
  rules: RuleSpec[];
  tools?: Partial<Record<EngineTool, boolean>>;
}
