/** Talks to the SO-101 hand-off server (RAX examples/handoff/server.py). */
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { loadCatalog } from "@/lib/catalog";
import { refreshCatalog } from "@/lib/inventory-source";
import { publicProduct } from "@/lib/public";

export const dynamic = "force-dynamic";

const ARM_URL = (process.env.ROBOT_ARM_URL || "http://127.0.0.1:8488").replace(/\/$/, "");

const RackSchema = z.object({
  items: z.array(z.object({ product_id: z.string(), prompt: z.string().min(1), grasp: z.enum(["top", "side"]).default("top") })),
});

function rack() {
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), "data", "robot-rack.json"), "utf8"));
  const { inventory } = loadCatalog();
  const byId = new Map(inventory.map((p) => [p.id, p]));
  return RackSchema.parse(raw).items.flatMap((it) => {
    const p = byId.get(it.product_id);
    return p ? [{ ...it, product: publicProduct(p) }] : [];
  });
}

async function arm(pathname: string, init?: RequestInit) {
  const r = await fetch(ARM_URL + pathname, { ...init, cache: "no-store", signal: AbortSignal.timeout(3000) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

export async function GET() {
  await refreshCatalog();
  let status: unknown = null;
  try {
    status = (await arm("/handoff/status")).body;
  } catch {
    status = null; // arm server not running
  }
  return NextResponse.json({ arm_url: ARM_URL, online: status !== null, status, rack: rack() });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("fetch"), item: z.string().min(1).max(120), grasp: z.enum(["top", "side"]).default("top") }),
  z.object({ action: z.literal("taken") }),
  z.object({ action: z.literal("cancel") }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const b = parsed.data;
  try {
    const res =
      b.action === "fetch"
        ? await arm("/handoff/fetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item: b.item, grasp: b.grasp }),
          })
        : await arm(`/handoff/${b.action}`, { method: "POST" });
    return NextResponse.json(res.body, { status: res.status });
  } catch {
    return NextResponse.json({ error: "the arm is offline" }, { status: 503 });
  }
}
