/**
 * Proposers: the "agent" half of the harness. Each generation one of them reads
 * the context the current ContextPolicy allows, may call the agent tools the
 * policy grants, and returns one Patch. They can propose changes to the store
 * (rules, weights, settings, features) or to themselves (context, tools).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ENGINE_TOOLS } from "@/lib/types";
import { describeOp, readConfig, signature } from "./policy";
import { AGENT_TOOLS, CONFIG_KEYS, SEGMENTS, type Diagnostics, type Generation, type Metrics, type Patch, type PatchOp, type Policy } from "./types";

export interface ProposerInput {
  gen: number;
  policy: Policy;
  /** Incumbent's diagnostics on the training shoppers. */
  diag: Diagnostics;
  history: Generation[];
  /** Dry-run a patch on a small training sample. Only usable if policy.agent_tools.what_if. */
  whatIf: (patch: Patch) => { delta: number; candidate: Metrics; violations: string[] };
}

export interface Proposal {
  patch: Patch;
  tool_calls: Array<{ tool: string; summary: string }>;
}

const STORE_STATUSES = new Set(["promoted", "rejected", "blocked", "pending_approval", "approved", "declined"]);

/** Fraction of recent shopper-facing proposals that shipped (or were queued for approval). */
export function acceptanceRate(history: Generation[], window = 6): number {
  const store = history.filter((g) => g.kind === "store" && STORE_STATUSES.has(g.status)).slice(-window);
  if (!store.length) return 0;
  return store.filter((g) => ["promoted", "pending_approval", "approved"].includes(g.status)).length / store.length;
}

const esc = (s: string) => `^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;

/* ================================================================== */
/* Heuristic proposer: works offline, mines failures, hill-climbs.     */
/* ================================================================== */

type Strategy = "rule" | "segment" | "weight" | "config";

export function heuristicPropose(input: ProposerInput): Proposal {
  const { policy, diag, history, gen } = input;
  const ctx = policy.context;
  const calls: Proposal["tool_calls"] = [];
  // Memory is only as long as the context policy allows.
  const remembered = history.slice(-ctx.include_history);
  const tried = new Set(remembered.map((g) => signature(g.patch)));
  const fresh = (p: Patch) => !tried.has(signature(p));

  // ---- self-modification: notice when the harness itself is holding it back
  const recentStore = history.filter((g) => g.kind === "store").slice(-4);
  const stuck = recentStore.length >= 4 && recentStore.every((g) => g.status === "rejected" || g.status === "blocked");
  const repeating = history.slice(-ctx.include_history - 6, -ctx.include_history).some((g) => g.status !== "promoted" && history.slice(-3).some((h) => signature(h.patch) === signature(g.patch)));
  const meta: Patch[] = [];
  if (repeating && ctx.include_history < 12)
    meta.push({ ops: [{ op: "set_context", key: "include_history", value: ctx.include_history + 4 }], rationale: "I re-proposed changes that already failed; I need a longer memory of past attempts." });
  if (stuck && !policy.agent_tools.what_if)
    meta.push({ ops: [{ op: "set_agent_tool", key: "what_if", value: true }], rationale: "Four proposals in a row failed evaluation. Let me dry-run candidates on a sample before submitting." });
  if (stuck && !ctx.include_segments)
    meta.push({ ops: [{ op: "set_context", key: "include_segments", value: true }], rationale: "Global tweaks keep failing; I need per-segment metrics to adapt the policy to specific shoppers and occasions." });
  if (stuck && ctx.failure_examples < 8)
    meta.push({ ops: [{ op: "set_context", key: "failure_examples", value: ctx.failure_examples + 3 }], rationale: "The few failure pairs I can see are exhausted; widen the failure evidence." });
  const harnessTrialRunning = history.some((g) => g.status === "trial");
  const freshMeta = meta.filter(fresh);
  if (freshMeta.length && !harnessTrialRunning) return { patch: freshMeta[0], tool_calls: calls };

  // ---- store changes
  const order: Strategy[] = ["rule", "segment", "weight", "config"];
  const rotate = order.slice(gen % order.length).concat(order.slice(0, gen % order.length));
  const candidates: Patch[] = [];

  for (const strategy of rotate) {
    const made = build(strategy, input, calls).filter(fresh);
    candidates.push(...made);
    if (!policy.agent_tools.what_if && candidates.length) break;
    if (candidates.length >= 4) break;
  }
  if (!candidates.length) {
    return { patch: { ops: [{ op: "set_context", key: "failure_examples", value: Math.min(20, ctx.failure_examples + 3) }], rationale: "Out of untried ideas; widening failure evidence." }, tool_calls: calls };
  }
  if (!policy.agent_tools.what_if) return { patch: candidates[0], tool_calls: calls };

  // With the what_if tool: dry-run each idea, submit the best.
  let best = candidates[0];
  let bestDelta = -Infinity;
  for (const c of candidates.slice(0, 4)) {
    const r = input.whatIf(c);
    calls.push({ tool: "what_if", summary: `${c.ops.map(describeOp).join("; ")} -> ${r.violations.length ? "violates guardrails" : `${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)}`}` });
    const score = r.violations.length ? -Infinity : r.delta;
    if (score > bestDelta) {
      bestDelta = score;
      best = c;
    }
  }
  // Every dry-run lost: rather than ship a known loser, change how I look at the problem.
  if (bestDelta <= 0 && !harnessTrialRunning) {
    const widen: Patch[] = [
      { ops: [{ op: "set_context" as const, key: "include_segments", value: true }], rationale: "Every global idea I dry-ran loses. Per-segment metrics should let me adapt to specific occasions instead." },
      { ops: [{ op: "set_context" as const, key: "failure_examples", value: Math.min(20, ctx.failure_examples + 3) }], rationale: "Every idea I dry-ran loses; I need more failure evidence to find new ones." },
    ].filter((p) => fresh(p) && !(p.ops[0].key === "include_segments" && ctx.include_segments));
    if (widen.length) return { patch: widen[0], tool_calls: calls };
  }
  return { patch: best, tool_calls: calls };
}

function build(strategy: Strategy, input: ProposerInput, calls: Proposal["tool_calls"]): Patch[] {
  const { policy, diag, gen } = input;
  const ctx = policy.context;
  switch (strategy) {
    case "rule": {
      if (!policy.agent_tools.pair_stats) return [];
      const failing = diag.pairs
        .filter((p) => !p.has_rule && p.shown >= 6)
        .sort((a, b) => b.reject_rate - a.reject_rate)
        .slice(0, ctx.failure_examples);
      calls.push({ tool: "pair_stats", summary: `top ${failing.length} unruled failing pairs: ${failing.map((f) => `${f.pair} ${(f.reject_rate * 100).toFixed(0)}%`).join(", ")}` });
      return failing.map((f) => {
        const [x, y] = f.pair.split(" + ");
        return {
          ops: [{ op: "add_rule", a: esc(x), b: esc(y), bonus: -0.2, reason: `shoppers turn down ${x} with ${y} (${(f.reject_rate * 100).toFixed(0)}% rejected)` }],
          rationale: `${x} + ${y} is shown often and rejected ${(f.reject_rate * 100).toFixed(0)}% of the time with no rule covering it. Penalize the pairing.`,
        } satisfies Patch;
      });
    }
    case "segment": {
      if (!ctx.include_segments) return [];
      const segs = [...diag.segments].filter((s) => s.segment.startsWith("occasion:")).sort((a, b) => a.satisfaction - b.satisfaction);
      const out: Patch[] = [];
      for (const s of segs) {
        const cur = { ...policy.weights, ...policy.segments[s.segment]?.weights };
        for (const key of ["formality", "color", "style"] as const) {
          for (const dir of [1, -1]) {
            const value = Math.round(Math.min(0.7, Math.max(0.05, cur[key] + dir * 0.08)) * 100) / 100;
            out.push({
              ops: [{ op: "set_weight", key, value, segment: s.segment }],
              rationale: `${s.segment} shoppers are the least satisfied (${(s.satisfaction * 100).toFixed(0)}%). Re-weight ${key} for that segment only.`,
            });
          }
        }
      }
      return out;
    }
    case "weight": {
      const keys = ["color", "style", "formality", "season"] as const;
      const key = keys[gen % keys.length];
      return [1, -1].map((dir) => ({
        ops: [{ op: "set_weight", key, value: Math.round(Math.min(0.7, Math.max(0.05, policy.weights[key] + dir * 0.05)) * 100) / 100 }],
        rationale: `Probe the global ${key} weight ${dir > 0 ? "up" : "down"}.`,
      }));
    }
    case "config": {
      const steps: Record<(typeof CONFIG_KEYS)[number], number> = {
        inventory_boost: 0.02,
        slow_mover_extra_pct: 2,
        bundle_discount_2: 2,
        bundle_discount_3: 2,
        slow_mover_days: 15,
        protect_min_items: 1,
      };
      const key = CONFIG_KEYS[Math.floor(gen / 4) % CONFIG_KEYS.length];
      const cur = readConfig(policy.config, key);
      return [1, -1].map((dir) => ({
        ops: [{ op: "set_config", key, value: Math.round((cur + dir * steps[key]) * 100) / 100 }],
        rationale: `Probe ${key} ${dir > 0 ? "up" : "down"} from ${cur}.`,
      }));
    }
  }
}

/* ================================================================== */
/* Claude proposer: same contract, tool use + structured submission.   */
/* ================================================================== */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const OpSchema = z.object({
  op: z.enum(["set_config", "set_weight", "add_rule", "remove_rule", "set_tool", "set_context", "set_agent_tool", "tighten_guardrail"]),
  key: z.string().nullable().describe("config key, weight name, tool name, or context key"),
  value: z.union([z.number(), z.boolean()]).nullable(),
  segment: z.enum(SEGMENTS).nullable().describe("limit a weight or rule to one shopper segment"),
  a: z.string().nullable().describe("add_rule: regex over item subtypes, e.g. ^loafer$"),
  b: z.string().nullable(),
  bonus: z.number().nullable().describe("add_rule: score bonus, negative to penalize"),
  reason: z.string().nullable(),
  id: z.string().nullable().describe("rule or guardrail id"),
});

const clean = (o: z.infer<typeof OpSchema>): PatchOp =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null)) as unknown as PatchOp;

function contextFor(input: ProposerInput): string {
  const { policy: p, diag } = input;
  const c = p.context;
  const parts: string[] = [];
  parts.push(`## Objective\nMaximize score = profit/shopper + 25*satisfaction + 0.1*slow-mover units per 100 shoppers, measured on simulated shoppers. A change ships only if it improves the training panel AND a held-out panel without breaking guardrails.`);
  parts.push(`## Current metrics (training panel)\n${JSON.stringify(diag.metrics, (_k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v))}`);
  parts.push(`## Policy v${p.version}\nweights: ${JSON.stringify(p.weights)}\nconfig: ${CONFIG_KEYS.map((k) => `${k}=${readConfig(p.config, k)}`).join(", ")}\nstore features: ${JSON.stringify(p.tools)}\nsegment overrides: ${JSON.stringify(p.segments)}`);
  parts.push(
    c.include_rules
      ? `## Stylist rules\n${p.rules.map((r) => `${r.id}: /${r.a}/ + /${r.b}/ ${r.bonus} (${r.reason})`).join("\n")}`
      : `## Stylist rules\n${p.rules.length} rules (${p.rules.filter((r) => r.origin === "agent").length} added by you). Set context include_rules=true to see them.`,
  );
  const failing = diag.pairs.filter((x) => x.shown >= 6).sort((a, b) => b.reject_rate - a.reject_rate).slice(0, c.failure_examples);
  parts.push(`## Most-rejected item pairs (subtype + subtype, times shown, reject rate, already covered by a rule?)\n${failing.map((f) => `${f.pair} | ${f.shown} | ${(f.reject_rate * 100).toFixed(0)}% | ${f.has_rule}`).join("\n")}`);
  if (c.include_segments)
    parts.push(`## Segments\n${diag.segments.map((s) => `${s.segment}: n=${s.shoppers} satisfaction=${s.satisfaction.toFixed(3)} profit=$${s.profit_per_shopper.toFixed(1)}`).join("\n")}`);
  const hist = input.history.slice(-c.include_history);
  if (hist.length)
    parts.push(
      `## Your recent attempts\n${hist
        .map((g) => `gen ${g.gen} [${g.status}] ${g.patch.ops.map(describeOp).join("; ")}${g.train ? ` train Δ${(g.train.candidate.score - g.train.incumbent.score).toFixed(2)}` : ""}${g.violations.length ? ` violations: ${g.violations.join("; ")}` : ""}`)
        .join("\n")}`,
    );
  parts.push(`## Guardrails\n${p.guardrails.map((g) => `${g.id} = ${g.value}${g.locked ? " (locked: tighten only)" : ""} — ${g.description}`).join("\n")}`);
  parts.push(`## Your harness\ncontext policy: ${JSON.stringify(c)}\nagent tools: ${JSON.stringify(p.agent_tools)}\nYou may change your own context policy (set_context) or request agent tools (set_agent_tool); those changes go on a trial and are reverted if your proposals don't get better. Store features (set_tool) and protect_min_items need human approval.`);
  return parts.join("\n\n");
}

export async function claudePropose(input: ProposerInput): Promise<Proposal> {
  const client = new Anthropic();
  const calls: Proposal["tool_calls"] = [];
  let submitted: Patch | null = null;
  const p = input.policy;

  const tools = [
    betaZodTool({
      name: "submit_patch",
      description: "Submit your one proposed change for evaluation. Call exactly once, as your final action.",
      inputSchema: z.object({ ops: z.array(OpSchema).min(1).max(4), rationale: z.string() }),
      run: async (inp) => {
        submitted = { ops: inp.ops.map(clean), rationale: inp.rationale };
        return "Submitted. The harness will evaluate it.";
      },
    }),
  ];
  if (p.agent_tools.what_if)
    tools.push(
      betaZodTool({
        name: "what_if",
        description: "Dry-run a candidate patch on a small sample of training shoppers. Returns the score change and any guardrail violations.",
        inputSchema: z.object({ ops: z.array(OpSchema).min(1).max(4) }),
        run: async (inp) => {
          const r = input.whatIf({ ops: inp.ops.map(clean), rationale: "dry run" });
          const summary = r.violations.length ? `violations: ${r.violations.join("; ")}` : `score Δ ${r.delta.toFixed(3)}, satisfaction ${r.candidate.satisfaction.toFixed(3)}`;
          calls.push({ tool: "what_if", summary: `${inp.ops.map((o) => describeOp(clean(o))).join("; ")} -> ${summary}` });
          return summary;
        },
      }) as unknown as (typeof tools)[number],
    );
  if (p.agent_tools.pair_stats)
    tools.push(
      betaZodTool({
        name: "pair_stats",
        description: "Look up shopper reactions to item pairs whose subtypes match a substring.",
        inputSchema: z.object({ subtype: z.string() }),
        run: async ({ subtype }) => {
          const rows = input.diag.pairs.filter((x) => x.pair.includes(subtype)).sort((a, b) => b.shown - a.shown).slice(0, 15);
          calls.push({ tool: "pair_stats", summary: `${subtype}: ${rows.length} pairs` });
          return rows.map((r) => `${r.pair} shown=${r.shown} reject=${(r.reject_rate * 100).toFixed(0)}% rule=${r.has_rule}`).join("\n") || "no pairs";
        },
      }) as unknown as (typeof tools)[number],
    );
  if (p.agent_tools.segment_report)
    tools.push(
      betaZodTool({
        name: "segment_report",
        description: "Per-segment satisfaction and profit for the training panel.",
        inputSchema: z.object({}),
        run: async () => {
          calls.push({ tool: "segment_report", summary: `${input.diag.segments.length} segments` });
          return JSON.stringify(input.diag.segments);
        },
      }) as unknown as (typeof tools)[number],
    );

  const system = `You are the improvement agent inside a styling harness for a clothing store. Each turn you propose ONE small, testable change to the policy, then call submit_patch. Prefer changes backed by the evidence you were given; don't repeat attempts that already failed. Valid config keys: ${CONFIG_KEYS.join(", ")}. Weights: color, style, formality, season. Store features: ${ENGINE_TOOLS.join(", ")}. Agent tools: ${AGENT_TOOLS.join(", ")}. Context keys: failure_examples, include_segments, include_history, include_rules.`;

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 8,
    output_config: { effort: "medium" },
    // On a safety decline, re-run on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    tools,
    messages: [{ role: "user", content: `${contextFor(input)}\n\nPropose one change for generation ${input.gen}.` }],
  });
  await runner;
  if (!submitted) throw new Error("Claude did not submit a patch");
  return { patch: submitted, tool_calls: calls };
}

/* ================================================================== */
/* Claude via the local Claude Code login (no API key)                 */
/* ================================================================== */

/**
 * Runs headless Claude Code (`claude -p`) on this machine, so the proposer uses
 * whatever account Claude Code is signed in with. Claude Code can't call the
 * harness's agent tools here, so their effect is preserved another way: granted
 * tools' data goes into the prompt, Claude returns up to three candidates, and
 * if `what_if` is granted the harness dry-runs them and submits the best.
 */
export async function claudeCodePropose(input: ProposerInput): Promise<Proposal> {
  const { spawn } = await import("node:child_process");
  const os = await import("node:os");
  const p = input.policy;
  const calls: Proposal["tool_calls"] = [{ tool: "claude_code", summary: "proposed via the local Claude Code login" }];

  const extra: string[] = [];
  if (p.agent_tools.pair_stats) {
    const rows = [...input.diag.pairs].filter((x) => x.shown >= 4).sort((a, b) => b.shown * b.reject_rate - a.shown * a.reject_rate).slice(0, 25);
    extra.push(`## pair_stats (granted tool): item pairs by rejected volume\n${rows.map((r) => `${r.pair} shown=${r.shown} reject=${(r.reject_rate * 100).toFixed(0)}% rule=${r.has_rule}`).join("\n")}`);
    calls.push({ tool: "pair_stats", summary: `${rows.length} pairs included` });
  }
  if (p.agent_tools.segment_report) {
    extra.push(`## segment_report (granted tool)\n${JSON.stringify(input.diag.segments)}`);
    calls.push({ tool: "segment_report", summary: `${input.diag.segments.length} segments included` });
  }

  // Drop the draft-2020-12 `$schema` header: the CLI's validator doesn't resolve it.
  const { $schema: _draft, ...schema } = z.toJSONSchema(z.object({ candidates: z.array(z.object({ ops: z.array(OpSchema).min(1).max(4), rationale: z.string() })).min(1).max(3) })) as Record<string, unknown>;
  const system = `You are the improvement agent inside a styling harness for a clothing store. Propose small, testable changes to the policy, best first. Prefer changes backed by the evidence; don't repeat attempts that already failed. Valid config keys: ${CONFIG_KEYS.join(", ")}. Weights: color, style, formality, season. Store features: ${ENGINE_TOOLS.join(", ")}. Agent tools: ${AGENT_TOOLS.join(", ")}. Context keys: failure_examples, include_segments, include_history, include_rules. Ops are flat objects: use null for fields an op doesn't need.`;
  const prompt = `${contextFor(input)}\n\n${extra.join("\n\n")}\n\nPropose up to 3 alternative changes for generation ${input.gen}, best first.`;

  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // use the Claude Code login, not a key
  const args = ["-p", "--output-format", "json", "--json-schema", JSON.stringify(schema), "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--system-prompt", system];
  const out = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.env.CLAUDE_CLI || "claude", args, { cwd: os.tmpdir(), env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Claude Code timed out"));
    }, 240_000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(stdout) : reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`));
    });
    child.stdin.end(prompt);
  });

  const res = JSON.parse(out) as { is_error?: boolean; result?: string; structured_output?: { candidates: Array<{ ops: Array<z.infer<typeof OpSchema>>; rationale: string }> } };
  if (res.is_error || !res.structured_output?.candidates?.length) throw new Error(`Claude Code returned no proposal: ${String(res.result).slice(0, 200)}`);
  const candidates: Patch[] = res.structured_output.candidates.map((c) => ({ ops: c.ops.map(clean), rationale: c.rationale }));

  if (!p.agent_tools.what_if || candidates.length === 1) return { patch: candidates[0], tool_calls: calls };
  let best = candidates[0];
  let bestDelta = -Infinity;
  for (const c of candidates) {
    const r = input.whatIf(c);
    calls.push({ tool: "what_if", summary: `${c.ops.map(describeOp).join("; ")} -> ${r.violations.length ? "violates guardrails" : `${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)}`}` });
    const score = r.violations.length ? -Infinity : r.delta;
    if (score > bestDelta) {
      bestDelta = score;
      best = c;
    }
  }
  return { patch: best, tool_calls: calls };
}

let cliCheck: boolean | null = null;
/** Is a signed-in Claude Code CLI available on this machine? */
export async function claudeCodeAvailable(): Promise<boolean> {
  if (cliCheck !== null) return cliCheck;
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.env.CLAUDE_CLI || "claude", ["--version"], { timeout: 10_000 });
  cliCheck = r.status === 0;
  return cliCheck;
}
