import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  type: z.enum(["view_item", "try_on", "external_click", "bundle_add", "add_to_cart", "checkout"]),
  shopper_id: z.string().min(1).max(80),
  product_id: z.string().optional(),
  product_ids: z.array(z.string()).max(20).optional(),
  look_id: z.string().max(200).optional(),
  value_cents: z.number().int().nonnegative().optional(),
  currency: z.enum(["USD", "USDC"]).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  await getStore().logEvent({ ...parsed.data, ts: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
