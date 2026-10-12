import { NextResponse } from "next/server";
import { z } from "zod";
import { allProducts, getProducts } from "@/lib/catalog";
import { activePolicy } from "@/lib/harness/evolve";
import { refreshCatalog } from "@/lib/inventory-source";
import { resolveScoring } from "@/lib/harness/policy";
import { currentSeason, parseOccasion } from "@/lib/intent";
import { llmLookBlurbs, llmParseOccasion } from "@/lib/llm";
import { publicLook, publicProduct } from "@/lib/public";
import { buildInventoryBundles, buildLooks } from "@/lib/reco/outfit";
import { getStore } from "@/lib/store";
import { SEASONS, STYLES } from "@/lib/types";

export const dynamic = "force-dynamic";

const Body = z.object({
  anchor_ids: z.array(z.string()).min(1).max(6),
  shopper_id: z.string().max(80).optional(),
  occasion_text: z.string().max(300).optional(),
  context: z
    .object({
      gender: z.enum(["women", "men", "unisex"]).optional(),
      formality: z.number().min(1).max(5).optional(),
      season: z.enum(SEASONS).optional(),
      styles: z.array(z.enum(STYLES)).optional(),
      budget_cents: z.number().int().positive().optional(),
    })
    .optional(),
  count: z.number().int().min(1).max(6).optional(),
  polish: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const body = parsed.data;

  await refreshCatalog();
  const anchors = getProducts(body.anchor_ids);
  if (!anchors.length) return NextResponse.json({ error: "unknown products" }, { status: 404 });

  // Occasion: Claude when available, keyword parser otherwise; explicit UI filters win.
  let context = { season: currentSeason(), ...body.context };
  let parsedBy: "llm" | "keywords" | null = null;
  if (body.occasion_text?.trim()) {
    const llm = await llmParseOccasion(body.occasion_text);
    parsedBy = llm ? "llm" : "keywords";
    context = { ...context, ...(llm ?? parseOccasion(body.occasion_text)), ...body.context };
  }

  const store = getStore();
  const profile = body.shopper_id ? await store.getProfile(body.shopper_id) : null;
  // The store runs on whatever policy the harness has promoted, adapted to this shopper's segment.
  const policy = activePolicy();
  const config = policy.config;
  const scoring = resolveScoring(policy, context);
  const catalog = allProducts();

  const looks = buildLooks({ anchors, catalog, config, profile, context, scoring, count: body.count ?? 3 });
  const bundles = anchors.length === 1 ? buildInventoryBundles({ anchors, catalog, config, profile, context, scoring }) : [];

  if (body.polish && policy.tools.llm_copy) {
    const blurbs = await llmLookBlurbs(looks, context);
    blurbs?.forEach((b, i) => (looks[i].blurb = b));
  }

  if (body.shopper_id) {
    await store.logEvent({
      type: "look_shown",
      shopper_id: body.shopper_id,
      product_ids: [...new Set(looks.flatMap((l) => l.items.map((i) => i.product.id)))],
      ts: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    policy_version: policy.version,
    context,
    parsed_by: parsedBy,
    looks: looks.map(publicLook),
    bundles: bundles.map((b) => ({ ...b, items: b.items.map(publicProduct) })),
  });
}
