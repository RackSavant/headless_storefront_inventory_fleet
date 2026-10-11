import { describe, expect, it } from "vitest";
import { allProducts, loadCatalog } from "@/lib/catalog";
import { runGeneration } from "@/lib/harness/evolve";
import { applyPatch, changeKind, needsApproval, outcomeViolations, resolveScoring, seedPolicy } from "@/lib/harness/policy";
import { evaluate, generateShoppers } from "@/lib/harness/simulator";
import type { HarnessState } from "@/lib/harness/types";

const { inventory, config } = loadCatalog();
const seed = seedPolicy(config);

describe("guardrails", () => {
  it("lets the agent tighten a locked guardrail but never loosen it", () => {
    const tighten = applyPatch(seed, { ops: [{ op: "tighten_guardrail", id: "min_margin_pct", value: 25 }], rationale: "" });
    expect(tighten.violations).toEqual([]);
    expect(tighten.policy.guardrails.find((g) => g.id === "min_margin_pct")!.value).toBe(25);
    const loosen = applyPatch(seed, { ops: [{ op: "tighten_guardrail", id: "min_margin_pct", value: 5 }], rationale: "" });
    expect(loosen.violations.join()).toMatch(/only be tightened/);
  });

  it("blocks discounts past the cap and rules past the bonus limit", () => {
    expect(applyPatch(seed, { ops: [{ op: "set_config", key: "bundle_discount_3", value: 28 }], rationale: "" }).violations.join()).toMatch(/exceeds guardrail/);
    expect(applyPatch(seed, { ops: [{ op: "add_rule", a: "^tee$", b: "^jogger$", bonus: 0.9 }], rationale: "" }).violations.join()).toMatch(/max_rule_bonus/);
  });

  it("flags outcome regressions on held-out shoppers", () => {
    const m = { shoppers: 1, profit_per_shopper: 50, revenue_per_shopper: 90, margin_rate: 0.55, conversion: 0.5, satisfaction: 0.8, slow_units_per_100: 50, affiliate_per_shopper: 2, score: 80 };
    expect(outcomeViolations(seed, m, { ...m, satisfaction: 0.77 })).toHaveLength(1);
    expect(outcomeViolations(seed, m, { ...m, margin_rate: 0.3 })).toHaveLength(1);
    expect(outcomeViolations(seed, m, { ...m, profit_per_shopper: 60 })).toHaveLength(0);
  });

  it("routes business-changing ops to a human and self-changes to a trial", () => {
    expect(needsApproval({ ops: [{ op: "set_tool", key: "partner_catalog", value: false }], rationale: "" })).toBe(true);
    expect(needsApproval({ ops: [{ op: "set_weight", key: "color", value: 0.4 }], rationale: "" })).toBe(false);
    expect(changeKind({ ops: [{ op: "set_agent_tool", key: "what_if", value: true }], rationale: "" })).toBe("harness");
    expect(changeKind({ ops: [{ op: "set_context", key: "include_segments", value: true }, { op: "set_weight", key: "color", value: 0.4 }], rationale: "" })).toBe("store");
  });
});

describe("per-segment adaptation", () => {
  it("applies segment overrides only to matching shoppers", () => {
    const { policy } = applyPatch(seed, {
      ops: [
        { op: "set_weight", key: "formality", value: 0.5, segment: "occasion:formal" },
        { op: "add_rule", a: "^clutch$", b: "^slip-dress$", bonus: 0.2, segment: "occasion:formal" },
      ],
      rationale: "",
    });
    const formal = resolveScoring(policy, { formality: 5 });
    const casual = resolveScoring(policy, { formality: 2 });
    expect(formal.weights.formality).toBe(0.5);
    expect(casual.weights.formality).toBe(seed.weights.formality);
    expect(formal.rules.length).toBe(casual.rules.length + 1);
  });
});

describe("simulator", () => {
  it("is deterministic so policies are compared on identical shoppers", () => {
    const shoppers = generateShoppers(7, 15, inventory);
    const a = evaluate(seed, shoppers, allProducts()).metrics;
    const b = evaluate(seed, generateShoppers(7, 15, inventory), allProducts()).metrics;
    expect(a).toEqual(b);
  });
});

describe("evolution loop", () => {
  it("only ships changes that beat the incumbent on held-out shoppers, within guardrails", async () => {
    const s: HarnessState = { active_version: 1, policies: [seed], generations: [], trial: null };
    for (let i = 0; i < 6; i++) await runGeneration(s, "heuristic");
    for (const g of s.generations) {
      if (g.status === "promoted" && g.kind === "store") {
        expect(g.holdout!.candidate.score).toBeGreaterThan(g.holdout!.incumbent.score);
        expect(g.holdout!.incumbent.satisfaction - g.holdout!.candidate.satisfaction).toBeLessThanOrEqual(0.015);
      }
    }
    const live = s.policies.find((p) => p.version === s.active_version)!;
    expect(applyPatch(live, { ops: [{ op: "set_context", key: "failure_examples", value: live.context.failure_examples }], rationale: "" }).violations).toEqual([]);
    expect(s.generations.some((g) => g.status === "promoted")).toBe(true);
  }, 120_000);
});
