import type { Look, Product } from "@/lib/types";

/** Shopper-facing copy of a product: no cost, no stock age. */
export function publicProduct(p: Product): Product {
  const { cost_cents: _c, received_at: _r, ...rest } = p;
  return rest;
}

export function publicLook(l: Look): Look {
  return { ...l, items: l.items.map(({ merch_note: _m, ...it }) => ({ ...it, product: publicProduct(it.product) })) };
}
