/**
 * Policy lifecycle: the seed, applying a patch, guardrail checks, and resolving
 * the effective policy for one shopper (segment overrides = per-user/task adaptation).
 */
import { SEED_RULES, SEED_WEIGHTS } from "@/lib/reco/compat";
import type { EngineTool, ScoringPolicy, ShopperContext, StoreConfig, Weights } from "@/lib/types";
import {
  AGENT_TOOLS,
  CONFIG_KEYS,
  SEGMENTS,
  type ChangeKind,
  type ConfigKey,
  type Guardrail,
  type Metrics,
  type Patch,
  type PatchOp,
  type Policy,
  type SegmentId,
} from "./types";

export const SEED_GUARDRAILS: Guardrail[] = [
  { id: "min_margin_pct", description: "Bundle prices never go below cost + this margin (%)", locked: true, stage: "policy", value: 20 },
  { id: "max_discount_pct", description: "Largest bundle discount incl. slow-mover extra (%)", locked: true, stage: "policy", value: 30 },
  { id: "max_rule_bonus", description: "Largest absolute bonus a single stylist rule may carry", locked: true, stage: "policy", value: 0.4 },
  { id: "max_rules", description: "Most stylist rules a policy may hold (keeps it auditable)", locked: true, stage: "policy", value: 40 },
  { id: "max_satisfaction_drop", description: "A change may not lower held-out shopper satisfaction by more than this", locked: true, stage: "outcome", value: 0.015 },
  { id: "min_margin_rate", description: "Held-out gross margin rate must stay at or above this", locked: true, stage: "outcome", value: 0.4 },
];

/** Changes a human must approve: they alter what the business offers, not just how it styles. */
const NEEDS_APPROVAL = (op: PatchOp) => op.op === "set_tool" || (op.op === "set_config" && op.key === "protect_min_items");

const BOUNDS: Record<ConfigKey, [number, number]> = {
  inventory_boost: [0, 0.3],
  slow_mover_extra_pct: [0, 15],
  bundle_discount_2: [0, 30],
  bundle_discount_3: [0, 30],
  slow_mover_days: [30, 365],
  protect_min_items: [1, 20],
};

export function seedPolicy(config: StoreConfig): Policy {
  return {
    version: 1,
    parent: null,
    created_at: new Date().toISOString(),
    author: "seed",
    rationale: "Hand-written starting point",
    config: structuredClone(config),
    weights: { ...SEED_WEIGHTS },
    rules: structuredClone(SEED_RULES),
    tools: { partner_catalog: true, bundle_discounts: true, slow_mover_push: true, llm_copy: true },
    segments: {},
    context: { failure_examples: 3, include_segments: false, include_history: 4, include_rules: false },
    // The agent starts without the ability to dry-run its own ideas; it can ask for it.
    agent_tools: { what_if: false, pair_stats: true, segment_report: false },
    guardrails: structuredClone(SEED_GUARDRAILS),
  };
}

const guard = (p: Policy, id: string) => p.guardrails.find((g) => g.id === id)?.value ?? Infinity;

export function readConfig(c: StoreConfig, key: ConfigKey): number {
  if (key === "bundle_discount_2") return c.bundle_discounts["2"] ?? 0;
  if (key === "bundle_discount_3") return c.bundle_discounts["3"] ?? 0;
  return c[key] as number;
}

function writeConfig(c: StoreConfig, key: ConfigKey, value: number) {
  if (key === "bundle_discount_2") c.bundle_discounts = { ...c.bundle_discounts, "2": value };
  else if (key === "bundle_discount_3") c.bundle_discounts = { ...c.bundle_discounts, "3": value };
  else (c as unknown as Record<string, number>)[key] = value;
}

/** Store changes alter shopper-facing behavior; harness changes alter how the agent itself works. */
export function changeKind(patch: Patch): ChangeKind {
  return patch.ops.every((o) => o.op === "set_context" || o.op === "set_agent_tool") ? "harness" : "store";
}

export function needsApproval(patch: Patch): boolean {
  return patch.ops.some(NEEDS_APPROVAL);
}

/** Stable fingerprint so the agent can remember what it already tried. */
export function signature(patch: Patch): string {
  return patch.ops
    .map((o) => [o.op, o.segment ?? "", o.key ?? "", o.a ?? "", o.b ?? "", o.id ?? "", o.value ?? o.bonus ?? ""].join(":"))
    .sort()
    .join(" + ");
}

/**
 * Apply a patch, collecting policy-guardrail violations instead of throwing.
 * Returns the candidate (version not yet assigned) and the reasons it may not ship.
 */
export function applyPatch(base: Policy, patch: Patch): { policy: Policy; violations: string[] } {
  const p: Policy = structuredClone(base);
  const v: string[] = [];
  if (!patch.ops.length) v.push("empty patch");

  for (const op of patch.ops) {
    const seg = op.segment ?? null;
    if (seg && !SEGMENTS.includes(seg)) {
      v.push(`unknown segment ${seg}`);
      continue;
    }
    switch (op.op) {
      case "set_config": {
        const key = op.key as ConfigKey;
        if (!CONFIG_KEYS.includes(key) || typeof op.value !== "number") {
          v.push(`set_config: unknown key or non-numeric value (${op.key})`);
          break;
        }
        const [lo, hi] = BOUNDS[key];
        if (op.value < lo || op.value > hi) v.push(`${key}=${op.value} is outside [${lo}, ${hi}]`);
        writeConfig(p.config, key, key === "slow_mover_days" || key === "protect_min_items" ? Math.round(op.value) : op.value);
        break;
      }
      case "set_weight": {
        const key = op.key as keyof Weights;
        if (!["color", "style", "formality", "season"].includes(key) || typeof op.value !== "number") {
          v.push(`set_weight: bad key/value (${op.key})`);
          break;
        }
        if (op.value < 0.02 || op.value > 0.8) v.push(`weight ${key}=${op.value} outside [0.02, 0.8]`);
        if (seg) {
          const o = (p.segments[seg] ??= {});
          o.weights = { ...o.weights, [key]: op.value };
        } else p.weights[key] = op.value;
        break;
      }
      case "add_rule": {
        if (!op.a || !op.b || typeof op.bonus !== "number") {
          v.push("add_rule needs a, b and bonus");
          break;
        }
        try {
          new RegExp(op.a);
          new RegExp(op.b);
        } catch {
          v.push(`add_rule: invalid pattern`);
          break;
        }
        if (Math.abs(op.bonus) > guard(p, "max_rule_bonus")) v.push(`rule bonus ${op.bonus} exceeds max_rule_bonus`);
        const rule = {
          id: `agent-${op.a.split("|")[0]}_${op.b.split("|")[0]}${seg ? `@${seg}` : ""}`.replace(/[^a-z0-9@:_-]/gi, "-"),
          a: op.a,
          b: op.b,
          bonus: op.bonus,
          reason: op.reason || "learned from shopper behavior",
          origin: "agent" as const,
        };
        if (seg) {
          const o = (p.segments[seg] ??= {});
          o.rules = [...(o.rules ?? []).filter((r) => r.id !== rule.id), rule];
        } else p.rules = [...p.rules.filter((r) => r.id !== rule.id), rule];
        break;
      }
      case "remove_rule": {
        const before = p.rules.length;
        p.rules = p.rules.filter((r) => r.id !== op.id);
        for (const o of Object.values(p.segments)) if (o?.rules) o.rules = o.rules.filter((r) => r.id !== op.id);
        if (p.rules.length === before && !Object.values(base.segments).some((o) => o?.rules?.some((r) => r.id === op.id)))
          v.push(`remove_rule: no rule ${op.id}`);
        break;
      }
      case "set_tool": {
        const tool = op.key as EngineTool;
        if (!(tool in p.tools) || typeof op.value !== "boolean") v.push(`set_tool: bad tool/value (${op.key})`);
        else p.tools[tool] = op.value;
        break;
      }
      case "set_agent_tool": {
        const tool = op.key as (typeof AGENT_TOOLS)[number];
        if (!AGENT_TOOLS.includes(tool) || typeof op.value !== "boolean") v.push(`set_agent_tool: bad tool/value (${op.key})`);
        else p.agent_tools[tool] = op.value;
        break;
      }
      case "set_context": {
        const key = op.key as keyof Policy["context"];
        if (!(key in p.context)) {
          v.push(`set_context: unknown key ${op.key}`);
          break;
        }
        if (typeof p.context[key] === "number") {
          if (typeof op.value !== "number" || op.value < 0 || op.value > 20) v.push(`set_context ${key} must be 0..20`);
          else (p.context as unknown as Record<string, number>)[key] = Math.round(op.value);
        } else if (typeof op.value !== "boolean") v.push(`set_context ${key} must be boolean`);
        else (p.context as unknown as Record<string, boolean>)[key] = op.value;
        break;
      }
      case "tighten_guardrail": {
        const g = p.guardrails.find((x) => x.id === op.id);
        if (!g || typeof op.value !== "number") {
          v.push(`tighten_guardrail: unknown guardrail ${op.id}`);
          break;
        }
        // "Tighter" means more conservative: higher floors, lower caps.
        const isFloor = g.id.startsWith("min_");
        const tighter = isFloor ? op.value >= g.value : op.value <= g.value;
        if (!tighter) v.push(`guardrail ${g.id} is locked and can only be tightened (${g.value} -> ${op.value} loosens it)`);
        else {
          g.value = op.value;
          // The margin floor guardrail governs the pricing setting directly.
          if (g.id === "min_margin_pct") p.config.min_margin_pct = Math.max(p.config.min_margin_pct, op.value);
        }
        break;
      }
      default:
        v.push(`unknown op ${(op as PatchOp).op}`);
    }
  }

  // Policy-stage guardrails on the resulting policy.
  if (p.config.min_margin_pct < guard(p, "min_margin_pct")) v.push(`min_margin_pct ${p.config.min_margin_pct} below guardrail`);
  const maxDisc = Math.max(...Object.values(p.config.bundle_discounts)) + p.config.slow_mover_extra_pct;
  if (maxDisc > guard(p, "max_discount_pct")) v.push(`max bundle discount ${maxDisc}% exceeds guardrail ${guard(p, "max_discount_pct")}%`);
  const ruleCount = p.rules.length + Object.values(p.segments).reduce((s, o) => s + (o?.rules?.length ?? 0), 0);
  if (ruleCount > guard(p, "max_rules")) v.push(`${ruleCount} rules exceeds max_rules`);
  const w = p.weights;
  if (Math.abs(w.color + w.style + w.formality + w.season - 1) > 0.25) v.push("weights drifted too far from summing to 1");

  return { policy: p, violations: v };
}

/** Outcome guardrails: compare candidate vs incumbent on held-out shoppers. */
export function outcomeViolations(policy: Policy, incumbent: Metrics, candidate: Metrics): string[] {
  const out: string[] = [];
  const drop = incumbent.satisfaction - candidate.satisfaction;
  if (drop > guard(policy, "max_satisfaction_drop"))
    out.push(`held-out satisfaction fell ${(drop * 100).toFixed(1)} pts (limit ${(guard(policy, "max_satisfaction_drop") * 100).toFixed(1)})`);
  if (candidate.margin_rate < guard(policy, "min_margin_rate"))
    out.push(`held-out margin rate ${(candidate.margin_rate * 100).toFixed(1)}% below ${(guard(policy, "min_margin_rate") * 100).toFixed(0)}%`);
  return out;
}

/** Which segments a shopper falls into, most specific last (later overrides win). */
export function segmentsFor(ctx: ShopperContext): SegmentId[] {
  const out: SegmentId[] = [];
  if (ctx.gender === "women") out.push("gender:women");
  if (ctx.gender === "men") out.push("gender:men");
  if (ctx.budget_cents !== undefined && ctx.budget_cents < 25000) out.push("budget:low");
  if (ctx.formality !== undefined) {
    if (ctx.formality >= 4) out.push("occasion:formal");
    else if (ctx.formality <= 1) out.push("occasion:active");
    else out.push("occasion:casual");
  }
  return out;
}

/** The scoring policy a specific shopper/task gets: base + matching segment overrides. */
export function resolveScoring(policy: Policy, ctx: ShopperContext): ScoringPolicy {
  let weights: Weights = { ...policy.weights };
  let rules = policy.rules;
  for (const seg of segmentsFor(ctx)) {
    const o = policy.segments[seg];
    if (!o) continue;
    if (o.weights) weights = { ...weights, ...o.weights };
    if (o.rules?.length) rules = [...rules, ...o.rules];
  }
  return { weights, rules, tools: policy.tools };
}

export function describeOp(o: PatchOp): string {
  const where = o.segment ? ` for ${o.segment}` : "";
  switch (o.op) {
    case "set_config":
      return `set ${o.key} = ${o.value}`;
    case "set_weight":
      return `set ${o.key} weight = ${o.value}${where}`;
    case "add_rule":
      return `add rule ${o.a} + ${o.b} (${(o.bonus ?? 0) > 0 ? "+" : ""}${o.bonus})${where}: ${o.reason ?? ""}`;
    case "remove_rule":
      return `remove rule ${o.id}`;
    case "set_tool":
      return `${o.value ? "enable" : "disable"} store feature ${o.key}`;
    case "set_agent_tool":
      return `${o.value ? "grant" : "revoke"} agent tool ${o.key}`;
    case "set_context":
      return `context: ${o.key} = ${o.value}`;
    case "tighten_guardrail":
      return `tighten guardrail ${o.id} to ${o.value}`;
  }
}
