import { NextResponse } from "next/server";
import { computeInsights } from "@/lib/insights";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const events = await getStore().listEvents();
  return NextResponse.json(computeInsights(events));
}
