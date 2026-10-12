import { NextResponse } from "next/server";
import { loadCatalog } from "@/lib/catalog";
import { activePolicy } from "@/lib/harness/evolve";
import { refreshCatalog, sourceStatus } from "@/lib/inventory-source";
import { llmEnabled } from "@/lib/llm";
import { publicProduct } from "@/lib/public";

export const dynamic = "force-dynamic";

export async function GET() {
  await refreshCatalog();
  const { inventory, external } = loadCatalog();
  const policy = activePolicy();
  const config = policy.config;
  return NextResponse.json({
    store_name: config.store_name,
    protect_min_items: config.protect_inventory_roles ? config.protect_min_items : 9999,
    policy_version: policy.version,
    scoring: { weights: policy.weights, rules: policy.rules, tools: policy.tools },
    llm: llmEnabled(),
    inventory_source: { source: sourceStatus.source, count: sourceStatus.count, rejected: sourceStatus.rejected.length, error: sourceStatus.error, fetched_at: sourceStatus.fetched_at },
    inventory: inventory.map(publicProduct),
    external: policy.tools.partner_catalog ? external.map(publicProduct) : [],
  });
}
