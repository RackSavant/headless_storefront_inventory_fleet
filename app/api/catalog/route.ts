import { NextResponse } from "next/server";
import { loadCatalog } from "@/lib/catalog";
import { llmEnabled } from "@/lib/llm";
import { publicProduct } from "@/lib/public";

export const dynamic = "force-dynamic";

export async function GET() {
  const { inventory, external, config } = loadCatalog();
  return NextResponse.json({
    store_name: config.store_name,
    protect_min_items: config.protect_inventory_roles ? config.protect_min_items : 9999,
    llm: llmEnabled(),
    inventory: inventory.map(publicProduct),
    external: external.map(publicProduct),
  });
}
