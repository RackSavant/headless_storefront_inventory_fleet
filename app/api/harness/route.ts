import { NextResponse } from "next/server";
import { z } from "zod";
import { activePolicy, decide, evolve, loadState, resetState, rollback, versionScores } from "@/lib/harness/evolve";
import { claudeCodeAvailable } from "@/lib/harness/proposers";
import { claudeAuthSource } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function snapshot() {
  const s = loadState();
  return {
    active_version: s.active_version,
    policy: activePolicy(s),
    seed: s.policies[0],
    versions: s.policies.map((p) => ({ version: p.version, parent: p.parent, author: p.author, rationale: p.rationale, created_at: p.created_at })),
    scores: versionScores(s),
    generations: s.generations,
    trial: s.trial,
    claude_auth: claudeAuthSource() ?? ((await claudeCodeAvailable()) ? "claude_code" : null),
  };
}

export async function GET() {
  return NextResponse.json(await snapshot());
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("evolve"), generations: z.number().int().min(1).max(10), proposer: z.enum(["heuristic", "claude"]) }),
  z.object({ action: z.literal("decide"), gen: z.number().int(), decision: z.enum(["approve", "decline"]) }),
  z.object({ action: z.literal("rollback"), version: z.number().int() }),
  z.object({ action: z.literal("reset") }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const b = parsed.data;
  try {
    if (b.action === "evolve") {
      const gens = b.proposer === "claude" ? Math.min(b.generations, 3) : b.generations;
      await evolve(gens, b.proposer);
    } else if (b.action === "decide") decide(b.gen, b.decision);
    else if (b.action === "rollback") rollback(b.version);
    else resetState();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 400 });
  }
  return NextResponse.json(await snapshot());
}
