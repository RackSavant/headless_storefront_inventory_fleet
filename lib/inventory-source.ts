/**
 * Inventory source switch. INVENTORY_SOURCE=firestore pulls the owner's items from Firestore into an
 * in-memory snapshot (so the recommender and 3D store keep their synchronous catalog API). Anything
 * else, or any Firestore failure, uses data/inventory.json.
 *
 * Env:
 *  INVENTORY_SOURCE=json|firestore         default json
 *  FIRESTORE_INVENTORY_COLLECTION          default "inventory"
 *  FIRESTORE_OWNER_ID                      optional; when set only docs with OWNER_FIELD == id are loaded
 *  FIRESTORE_OWNER_FIELD                   default "owner_id"
 *  INVENTORY_REFRESH_SECONDS               default 30
 *  INVENTORY_FIRESTORE_SHAPE=product|listings  default product; "listings" maps the RackSavant app's marketplace
 *                                          listings (active only) through lib/listing-adapter.ts
 */
import { ProductSchema, setRemoteInventory } from "@/lib/catalog";
import { listingToProduct } from "@/lib/listing-adapter";
import type { Product } from "@/lib/types";

export interface RawDoc {
  id: string;
  data: Record<string, unknown>;
}

export type InventoryFetcher = () => Promise<RawDoc[]>;

export interface ParseResult {
  items: Product[];
  rejected: Array<{ id: string; error: string }>;
}

/** Firestore Timestamps expose toDate(); everything else passes through. */
function plain(value: unknown): unknown {
  if (value && typeof value === "object") {
    const v = value as { toDate?: () => Date };
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    if (Array.isArray(value)) return value.map(plain);
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, plain(x)]));
  }
  return value;
}

export function parseInventoryDocs(docs: RawDoc[], shape: "product" | "listings" = "product"): ParseResult {
  const items: Product[] = [];
  const rejected: ParseResult["rejected"] = [];
  for (const d of docs) {
    if (shape === "listings") {
      const r = listingToProduct(d.id, plain(d.data) as Record<string, unknown>);
      if ("product" in r) items.push(r.product);
      else rejected.push({ id: d.id, error: r.skip });
      continue;
    }
    const candidate = { ...(plain(d.data) as Record<string, unknown>), id: (d.data.id as string) || d.id, source: "inventory" };
    const res = ProductSchema.safeParse(candidate);
    if (res.success) items.push(res.data as Product);
    else rejected.push({ id: d.id, error: res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  }
  return { items, rejected };
}

async function firestoreFetcher(): Promise<RawDoc[]> {
  const { getFirestoreDb } = await import("@/lib/firebase");
  const db = await getFirestoreDb();
  let q: FirebaseFirestore.Query = db.collection(process.env.FIRESTORE_INVENTORY_COLLECTION || "inventory");
  if (process.env.FIRESTORE_OWNER_ID) q = q.where(process.env.FIRESTORE_OWNER_FIELD || "owner_id", "==", process.env.FIRESTORE_OWNER_ID);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

let fetcher: InventoryFetcher = firestoreFetcher;
let lastFetch = 0;
let inflight: Promise<void> | null = null;
export const sourceStatus = { source: "json" as "json" | "firestore", count: 0, rejected: [] as ParseResult["rejected"], error: null as string | null, fetched_at: null as string | null };

/** For tests and alternate backends. */
export function setInventoryFetcher(f: InventoryFetcher | null) {
  fetcher = f ?? firestoreFetcher;
  lastFetch = 0;
}

export function inventorySourceName() {
  return process.env.INVENTORY_SOURCE === "firestore" ? "firestore" : "json";
}

export async function refreshCatalog(force = false): Promise<void> {
  if (inventorySourceName() !== "firestore") {
    if (sourceStatus.source !== "json") setRemoteInventory(null);
    sourceStatus.source = "json";
    return;
  }
  const ttl = Number(process.env.INVENTORY_REFRESH_SECONDS ?? 30) * 1000;
  if (!force && Date.now() - lastFetch < ttl) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { items, rejected } = parseInventoryDocs(await fetcher(), process.env.INVENTORY_FIRESTORE_SHAPE === "listings" ? "listings" : "product");
      setRemoteInventory(items);
      Object.assign(sourceStatus, { source: "firestore", count: items.length, rejected, error: null, fetched_at: new Date().toISOString() });
      if (rejected.length) console.warn(`[inventory] skipped ${rejected.length} Firestore docs`, rejected.slice(0, 5));
    } catch (e) {
      sourceStatus.error = e instanceof Error ? e.message : String(e);
      console.error("[inventory] Firestore fetch failed, keeping previous snapshot / JSON fallback:", sourceStatus.error);
    } finally {
      lastFetch = Date.now();
      inflight = null;
    }
  })();
  return inflight;
}
