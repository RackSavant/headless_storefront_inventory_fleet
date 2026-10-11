import { NextResponse } from "next/server";
import { z } from "zod";
import { getProducts } from "@/lib/catalog";
import { applyFeedback, emptyProfile } from "@/lib/reco/profile";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  shopper_id: z.string().min(1).max(80),
  product_id: z.string().min(1),
  verdict: z.enum(["like", "dislike"]),
  reason: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const { shopper_id, product_id, verdict, reason } = parsed.data;
  const [product] = getProducts([product_id]);
  if (!product) return NextResponse.json({ error: "unknown product" }, { status: 404 });

  const store = getStore();
  const current = (await store.getProfile(shopper_id)) ?? emptyProfile(shopper_id);
  const { profile, learned } = applyFeedback(current, product, verdict, reason);
  await store.saveProfile(profile);
  await store.logEvent({ type: verdict, shopper_id, product_id, reason, ts: new Date().toISOString() });
  return NextResponse.json({ profile, learned });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("shopper_id");
  if (!id) return NextResponse.json({ error: "shopper_id required" }, { status: 400 });
  return NextResponse.json({ profile: await getStore().getProfile(id) });
}
