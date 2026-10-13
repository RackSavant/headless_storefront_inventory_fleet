import { z } from "zod";
import { toProduct } from "./importing";
import type { Product } from "./types";

const Listing = z.object({
  title: z.string().trim().min(1),
  status: z.literal("active"),
  description: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  size: z.string().optional(),
  priceUsdc: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  imageUrls: z.array(z.string().url().refine((url) => url.startsWith("https://"))).default([]),
  tags: z.array(z.string()).default([]),
  variants: z.array(z.object({
    size: z.string().optional(), color: z.string().optional(), quantity: z.number().int().nonnegative(),
  })).default([]),
});

export function listingToProduct(id: string, input: unknown): Product | null {
  const parsed = Listing.safeParse(input);
  if (!parsed.success) return null;
  const row = parsed.data;
  const available = row.variants.filter((v) => v.quantity > 0);
  const quantity = row.variants.length ? available.reduce((sum, v) => sum + v.quantity, 0) : 1;
  if (!quantity) return null;
  const colors = [...new Set(available.map((v) => v.color?.trim()).filter(Boolean))];
  const price = Math.round(Number(row.priceUsdc) * 100);
  if (!Number.isSafeInteger(price)) return null;
  const product = toProduct({
    id: `firebase_${id}`, title: row.title, brand: row.brand,
    text: row.category ?? "",
    price_cents: price, quantity, color: colors.length === 1 ? colors[0] : undefined,
    sizes: [...new Set(available.map((v) => v.size).filter((size): size is string => !!size))],
    image_url: row.imageUrls[0],
  }, "inventory");
  if (!product) return null;
  if (!row.variants.length && row.size) product.sizes = [row.size];
  return { ...product, currency: "USDC" };
}

export function decodeFirestore(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const field = value as Record<string, unknown>;
  if ("stringValue" in field) return field.stringValue;
  if ("timestampValue" in field) return field.timestampValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("booleanValue" in field) return field.booleanValue;
  if ("arrayValue" in field) return ((field.arrayValue as { values?: unknown[] }).values ?? []).map(decodeFirestore);
  if ("mapValue" in field) return Object.fromEntries(Object.entries((field.mapValue as { fields?: Record<string, unknown> }).fields ?? {}).map(([key, entry]) => [key, decodeFirestore(entry)]));
  return null;
}
