import { NextResponse } from "next/server";
import { refreshCatalog } from "@/lib/inventory-source";
import { computeInsights } from "@/lib/insights";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  await refreshCatalog();
  const events = await getStore().listEvents();
  return NextResponse.json(computeInsights(events));
}
