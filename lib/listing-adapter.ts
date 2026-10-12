/**
 * Maps a RackSavant app `listings` Firestore document (marketplace item: title, category, tags, priceUsdc,
 * imageUrls, size, status, shopId...) to the store's Product shape using the same tagging as the importers.
 * Fields used: title, description, detectedLabel, category, tags, brand, priceUsdc, imageUrls, size,
 * condition, status, createdAt, sellerId, shopId. Nothing else is read.
 */
import { toProduct, type RawItem } from "@/lib/importing";
import type { Product } from "@/lib/types";

type Doc = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export type ListingSkip = "not_active" | "no_price" | "no_title" | "no_role";

export function listingToProduct(docId: string, d: Doc): { product: Product } | { skip: ListingSkip } {
  if (str(d.status) && str(d.status) !== "active") return { skip: "not_active" };
  const title = str(d.title);
  if (!title) return { skip: "no_title" };
  const price = Number.parseFloat(str(d.priceUsdc) || String(d.priceUsdc ?? ""));
  if (!Number.isFinite(price) || price < 0) return { skip: "no_price" };

  const tags = Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === "string") : [];
  const images = Array.isArray(d.imageUrls) ? d.imageUrls.filter((u): u is string => typeof u === "string" && u.length > 0) : [];
  const created = d.createdAt as { toDate?: () => Date } | string | undefined;
  const receivedAt = typeof created === "string" ? created : created?.toDate?.().toISOString();
  const size = str(d.size);

  const raw: RawItem = {
    id: `inv_${docId}`,
    title,
    text: [str(d.category), str(d.detectedLabel), ...tags, str(d.description)].filter(Boolean).join(" "),
    price_cents: Math.round(price * 100),
    brand: str(d.brand) || undefined,
    image_url: images[0],
    sku: docId,
    quantity: 1,
    received_at: receivedAt,
    sizes: size ? [size] : undefined,
  };
  const product = toProduct(raw, "inventory");
  return product ? { product } : { skip: "no_role" };
}
