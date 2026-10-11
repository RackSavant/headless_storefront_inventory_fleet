"use client";

import type { Bundle, Look, Product, ShopperContext, ShopperProfile } from "@/lib/types";

export const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function getShopperId(): string {
  try {
    let id = localStorage.getItem("shopper_id");
    if (!id) {
      id = `shp_${crypto.randomUUID().slice(0, 12)}`;
      localStorage.setItem("shopper_id", id);
    }
    return id;
  } catch {
    return "shp_anonymous";
  }
}

export interface CatalogResponse {
  store_name: string;
  protect_min_items: number;
  llm: boolean;
  inventory: Product[];
  external: Product[];
}

export type InventoryBundle = Bundle & { items: Product[]; title: string };

export interface LooksResponse {
  context: ShopperContext;
  parsed_by: "llm" | "keywords" | null;
  looks: Look[];
  bundles: InventoryBundle[];
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

export const api = {
  catalog: () => fetch("/api/catalog").then((r) => r.json() as Promise<CatalogResponse>),
  looks: (body: {
    anchor_ids: string[];
    shopper_id: string;
    occasion_text?: string;
    context?: ShopperContext;
    polish?: boolean;
  }) => post<LooksResponse>("/api/looks", body),
  feedback: (body: { shopper_id: string; product_id: string; verdict: "like" | "dislike"; reason?: string }) =>
    post<{ profile: ShopperProfile; learned: Array<{ key: string; value: string }> }>("/api/feedback", body),
  event: (body: Record<string, unknown>) => post("/api/events", body).catch(() => null),
};
