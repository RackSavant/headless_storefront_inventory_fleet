/**
 * The harness's evolvable "architecture". A Policy is everything the stylist
 * runs on (rules, weights, business settings, store features, per-segment
 * overrides) plus everything the improving agent runs on (what context it
 * sees, which tools it may call, and the guardrails it must respect).
 */
import type { EngineTool, RuleSpec, StoreConfig, Weights } from "@/lib/types";

/** What the proposing agent is shown each generation. Evolvable. */
export interface ContextPolicy {
  /** Number of worst-performing item pairs included as failure evidence. */
  failure_examples: number;
  /** Include per-segment (occasion / gender / budget) metrics. */
  include_segments: boolean;
  /** Past generations (change + outcome) included as memory. */
  include_history: number;
  /** Include the full rule list (vs. a count). */
  include_rules: boolean;
}

export const AGENT_TOOLS = ["what_if", "pair_stats", "segment_report"] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

/** Business knobs the agent may tune. Flattened so a change is one key + value. */
export const CONFIG_KEYS = [
  "inventory_boost",
  "slow_mover_extra_pct",
  "bundle_discount_2",
  "bundle_discount_3",
  "slow_mover_days",
  "protect_min_items",
] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

export const SEGMENTS = ["occasion:formal", "occasion:casual", "occasion:active", "gender:women", "gender:men", "budget:low"] as const;
export type SegmentId = (typeof SEGMENTS)[number];

export interface SegmentOverride {
  weights?: Partial<Weights>;
  rules?: RuleSpec[];
}

/**
 * Guardrails are limits on what a policy may be, plus limits on outcomes.
 * Locked guardrails can be tightened by the agent but never loosened or removed.
 */
export interface Guardrail {
  id: string;
  description: string;
  locked: boolean;
  /** Policy guardrails are checked before evaluation; outcome guardrails after. */
  stage: "policy" | "outcome";
  value: number;
}

export interface Policy {
  version: number;
  parent: number | null;
  created_at: string;
  author: "seed" | "agent" | "human";
  rationale: string;
  config: StoreConfig;
  weights: Weights;
  rules: RuleSpec[];
  tools: Record<EngineTool, boolean>;
  segments: Partial<Record<SegmentId, SegmentOverride>>;
  context: ContextPolicy;
  agent_tools: Record<AgentTool, boolean>;
  guardrails: Guardrail[];
}

/**
 * One change to the policy. Flat shape (one `op` plus the fields it needs) so
 * Claude can emit it with strict tool use and the heuristic can build it too.
 */
export interface PatchOp {
  op:
    | "set_config"
    | "set_weight"
    | "add_rule"
    | "remove_rule"
    | "set_tool"
    | "set_context"
    | "set_agent_tool"
    | "tighten_guardrail";
  key?: string;
  value?: number | boolean;
  segment?: SegmentId | null;
  a?: string;
  b?: string;
  bonus?: number;
  reason?: string;
  id?: string;
}

export interface Patch {
  ops: PatchOp[];
  rationale: string;
}

export type ChangeKind = "store" | "harness";

export interface Metrics {
  shoppers: number;
  /** Expected gross margin + affiliate revenue per shopper, in dollars. */
  profit_per_shopper: number;
  revenue_per_shopper: number;
  margin_rate: number;
  conversion: number;
  satisfaction: number;
  slow_units_per_100: number;
  affiliate_per_shopper: number;
  /** The objective the harness maximizes. */
  score: number;
}

export interface PairStat {
  pair: string;
  shown: number;
  rejected: number;
  reject_rate: number;
  has_rule: boolean;
}

export interface SegmentStat {
  segment: SegmentId;
  shoppers: number;
  satisfaction: number;
  profit_per_shopper: number;
}

export interface Diagnostics {
  metrics: Metrics;
  pairs: PairStat[];
  segments: SegmentStat[];
}

export type GenerationStatus = "promoted" | "rejected" | "blocked" | "pending_approval" | "trial" | "reverted" | "approved" | "declined";

export interface Generation {
  gen: number;
  ts: string;
  proposer: "heuristic" | "claude";
  base_version: number;
  patch: Patch;
  kind: ChangeKind;
  status: GenerationStatus;
  violations: string[];
  /** Incumbent vs candidate on the training shoppers and the held-out shoppers. */
  train?: { incumbent: Metrics; candidate: Metrics };
  holdout?: { incumbent: Metrics; candidate: Metrics };
  new_version?: number;
  note?: string;
  /** Agent tool calls made while proposing (Claude proposer). */
  tool_calls?: Array<{ tool: string; summary: string }>;
}

export interface HarnessState {
  active_version: number;
  policies: Policy[];
  generations: Generation[];
  /** A harness change on probation: kept only if proposals do better under it. */
  trial: { gen: number; previous_version: number; baseline_rate: number; until_gen: number } | null;
  /** Panel metrics per policy version, filled in as versions are evaluated. */
  scores?: Record<number, { train: Metrics; holdout: Metrics }>;
}
