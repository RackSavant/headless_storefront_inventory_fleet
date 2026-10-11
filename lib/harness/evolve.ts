/**
 * The self-improvement loop.
 *
 *   propose (heuristic or Claude, within its context policy and tool grants)
 *     -> apply + policy guardrails            (blocked if violated)
 *     -> train panel: must beat incumbent      (rejected otherwise)
 *     -> held-out panel: must beat incumbent   (rejected: overfit)
 *        + outcome guardrails                  (blocked if violated)
 *     -> needs human approval?                 (pending_approval)
 *     -> promote: new policy version, live in the store
 *
 * Harness changes (the agent's own context policy and tools) can't be scored on
 * shoppers directly, so they ship on trial and are reverted automatically if
 * the agent's proposals don't get accepted more often under them.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { allProducts, loadCatalog } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { applyPatch, changeKind, needsApproval, outcomeViolations, seedPolicy } from "./policy";
import { claudeAuthSource } from "@/lib/llm";
import { acceptanceRate, claudeCodeAvailable, claudeCodePropose, claudePropose, heuristicPropose, type Proposal } from "./proposers";
import { evaluate, generateShoppers, PANELS, type SimShopper } from "./simulator";
import type { Diagnostics, Generation, HarnessState, Patch, Policy } from "./types";

const DIR = path.join(process.cwd(), ".data", "harness");
const FILE = path.join(DIR, "state.json");

const TRIAL_LENGTH = 5;
const MIN_TRAIN_GAIN = 0.05;

/* ---------------- persistence ---------------- */

export function loadState(): HarnessState {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as HarnessState;
  } catch {
    const seed = seedPolicy(loadCatalog().config);
    return { active_version: 1, policies: [seed], generations: [], trial: null };
  }
}

function saveState(s: HarnessState) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 1));
}

export function resetState(): HarnessState {
  const seed = seedPolicy(loadCatalog().config);
  const s: HarnessState = { active_version: 1, policies: [seed], generations: [], trial: null };
  saveState(s);
  evalCache.clear();
  return s;
}

export function activePolicy(s: HarnessState = loadState()): Policy {
  return s.policies.find((p) => p.version === s.active_version) ?? s.policies[0];
}

/* ---------------- evaluation with caching ---------------- */

let panels: { key: string; train: SimShopper[]; holdout: SimShopper[]; sample: SimShopper[]; catalog: Product[] } | null = null;
const evalCache = new Map<string, Diagnostics>();

function getPanels() {
  const { inventory, key } = loadCatalog();
  if (panels?.key !== key) {
    const train = generateShoppers(PANELS.train.seed, PANELS.train.n, inventory);
    panels = {
      key,
      train,
      holdout: generateShoppers(PANELS.holdout.seed, PANELS.holdout.n, inventory),
      sample: train.filter((_, i) => i % 3 === 0),
      catalog: allProducts(),
    };
    evalCache.clear();
  }
  return panels;
}

function evalOn(policy: Policy, panel: "train" | "holdout" | "sample", cacheKey?: string): Diagnostics {
  const P = getPanels();
  const key = cacheKey ? `${cacheKey}:${panel}` : null;
  if (key && evalCache.has(key)) return evalCache.get(key)!;
  const d = evaluate(policy, P[panel], P.catalog);
  if (key) evalCache.set(key, d);
  return d;
}

/* ---------------- versions ---------------- */

function promote(
  s: HarnessState,
  policy: Policy,
  base: Policy,
  author: Policy["author"],
  rationale: string,
  metrics?: { train: Diagnostics; holdout: Diagnostics } | "same-as-base",
): number {
  const version = Math.max(...s.policies.map((p) => p.version)) + 1;
  s.policies.push({ ...policy, version, parent: base.version, created_at: new Date().toISOString(), author, rationale });
  s.active_version = version;
  s.scores ??= {};
  if (metrics === "same-as-base") {
    // Harness-only change: shoppers see exactly what they saw before.
    if (s.scores[base.version]) s.scores[version] = s.scores[base.version];
    for (const panel of ["train", "holdout", "sample"]) {
      const d = evalCache.get(`v${base.version}:${panel}`);
      if (d) evalCache.set(`v${version}:${panel}`, d);
    }
  } else if (metrics) {
    s.scores[version] = { train: metrics.train.metrics, holdout: metrics.holdout.metrics };
    evalCache.set(`v${version}:train`, metrics.train);
    evalCache.set(`v${version}:holdout`, metrics.holdout);
  }
  return version;
}

/* ---------------- one generation ---------------- */

export type ProposerName = "heuristic" | "claude";

async function propose(name: ProposerName, input: Parameters<typeof heuristicPropose>[0]): Promise<{ proposal: Proposal; used: ProposerName }> {
  if (name === "claude") {
    try {
      // API credentials (key or `ant auth login` profile) first; otherwise this machine's Claude Code login.
      if (claudeAuthSource()) return { proposal: await claudePropose(input), used: "claude" };
      if (await claudeCodeAvailable()) return { proposal: await claudeCodePropose(input), used: "claude" };
      throw new Error("no Claude credentials or Claude Code CLI found");
    } catch (err) {
      console.warn("[harness] Claude proposer failed, falling back to heuristic:", err instanceof Error ? err.message : err);
    }
  }
  return { proposal: heuristicPropose(input), used: "heuristic" };
}

export async function runGeneration(s: HarnessState, proposer: ProposerName): Promise<Generation> {
  const incumbent = activePolicy(s);
  const gen = (s.generations.at(-1)?.gen ?? 0) + 1;
  const incTrain = evalOn(incumbent, "train", `v${incumbent.version}`);

  const whatIf = (patch: Patch) => {
    const { policy, violations } = applyPatch(incumbent, patch);
    const base = evalOn(incumbent, "sample", `v${incumbent.version}`);
    const cand = violations.length ? base : evalOn(policy, "sample");
    return { delta: cand.metrics.score - base.metrics.score, candidate: cand.metrics, violations };
  };

  const { proposal, used } = await propose(proposer, { gen, policy: incumbent, diag: incTrain, history: s.generations, whatIf });
  const patch = proposal.patch;
  const kind = changeKind(patch);
  const record: Generation = {
    gen,
    ts: new Date().toISOString(),
    proposer: used,
    base_version: incumbent.version,
    patch,
    kind,
    status: "rejected",
    violations: [],
    tool_calls: proposal.tool_calls,
  };

  const { policy: candidate, violations } = applyPatch(incumbent, patch);
  if (violations.length) {
    record.status = "blocked";
    record.violations = violations;
  } else if (kind === "harness") {
    if (s.trial) {
      record.status = "blocked";
      record.violations = [`harness trial from gen ${s.trial.gen} still running`];
    } else {
      record.new_version = promote(s, candidate, incumbent, "agent", patch.rationale, "same-as-base");
      record.status = "trial";
      s.trial = { gen, previous_version: incumbent.version, baseline_rate: acceptanceRate(s.generations), until_gen: gen + TRIAL_LENGTH };
      record.note = `On trial until gen ${gen + TRIAL_LENGTH}; kept only if proposals are accepted more often than ${(s.trial.baseline_rate * 100).toFixed(0)}%.`;
    }
  } else {
    const candTrain = evalOn(candidate, "train");
    record.train = { incumbent: incTrain.metrics, candidate: candTrain.metrics };
    if (candTrain.metrics.score < incTrain.metrics.score + MIN_TRAIN_GAIN) {
      record.status = "rejected";
      record.note = "No improvement on training shoppers.";
    } else {
      const incHold = evalOn(incumbent, "holdout", `v${incumbent.version}`);
      const candHold = evalOn(candidate, "holdout");
      record.holdout = { incumbent: incHold.metrics, candidate: candHold.metrics };
      const outcome = outcomeViolations(incumbent, incHold.metrics, candHold.metrics);
      if (outcome.length) {
        record.status = "blocked";
        record.violations = outcome;
      } else if (candHold.metrics.score <= incHold.metrics.score) {
        record.status = "rejected";
        record.note = "Improved training shoppers but not held-out shoppers (overfit).";
      } else if (needsApproval(patch)) {
        record.status = "pending_approval";
        record.note = "Passed evaluation; changes what the store offers, so a person must approve.";
      } else {
        record.new_version = promote(s, candidate, incumbent, "agent", patch.rationale, { train: candTrain, holdout: candHold });
        record.status = "promoted";
      }
    }
  }

  s.generations.push(record);
  settleTrial(s, gen);
  return record;
}

/** End a harness trial: keep the change if the agent got better under it, revert otherwise. */
function settleTrial(s: HarnessState, gen: number) {
  const t = s.trial;
  if (!t || gen < t.until_gen) return;
  const during = s.generations.filter((g) => g.gen > t.gen);
  const rate = acceptanceRate(during, TRIAL_LENGTH);
  const trialGen = s.generations.find((g) => g.gen === t.gen)!;
  if (rate >= t.baseline_rate && rate > 0) {
    trialGen.status = "promoted";
    trialGen.note = `Kept: ${(rate * 100).toFixed(0)}% of proposals accepted during the trial vs ${(t.baseline_rate * 100).toFixed(0)}% before.`;
  } else {
    // Restore the previous harness settings on top of whatever the store policy is now.
    const prev = s.policies.find((p) => p.version === t.previous_version)!;
    const cur = activePolicy(s);
    promote(s, { ...cur, context: prev.context, agent_tools: prev.agent_tools }, cur, "agent", `revert harness change from gen ${t.gen}`, "same-as-base");
    trialGen.status = "reverted";
    trialGen.note = `Reverted: ${(rate * 100).toFixed(0)}% accepted during the trial vs ${(t.baseline_rate * 100).toFixed(0)}% before.`;
  }
  s.trial = null;
}

export async function evolve(generations: number, proposer: ProposerName = "heuristic"): Promise<{ state: HarnessState; records: Generation[] }> {
  const s = loadState();
  const records: Generation[] = [];
  for (let i = 0; i < generations; i++) {
    records.push(await runGeneration(s, proposer));
    saveState(s);
  }
  return { state: s, records };
}

/* ---------------- human decisions ---------------- */

export function decide(gen: number, decision: "approve" | "decline"): Generation {
  const s = loadState();
  const g = s.generations.find((x) => x.gen === gen);
  if (!g || g.status !== "pending_approval") throw new Error(`generation ${gen} is not awaiting approval`);
  if (decision === "decline") {
    g.status = "declined";
  } else {
    // Re-apply on top of whatever is live now, since other changes may have shipped meanwhile.
    const cur = activePolicy(s);
    const { policy, violations } = applyPatch(cur, g.patch);
    if (violations.length) throw new Error(`no longer valid: ${violations.join("; ")}`);
    g.new_version = promote(s, policy, cur, "human", `approved: ${g.patch.rationale}`);
    g.status = "approved";
  }
  saveState(s);
  return g;
}

export function rollback(version: number): HarnessState {
  const s = loadState();
  const target = s.policies.find((p) => p.version === version);
  if (!target) throw new Error(`no version ${version}`);
  promote(s, target, activePolicy(s), "human", `rollback to v${version}`);
  saveState(s);
  return s;
}

/** Score history for charts: held-out score of each version when it was active. */
export function versionScores(s: HarnessState): Array<{ version: number; train: number; holdout: number; satisfaction: number; profit: number; slow: number; conversion: number }> {
  s.scores ??= {};
  let dirty = false;
  const out = s.policies.map((p) => {
    let m = s.scores![p.version];
    if (!m) {
      m = { train: evalOn(p, "train", `v${p.version}`).metrics, holdout: evalOn(p, "holdout", `v${p.version}`).metrics };
      s.scores![p.version] = m;
      dirty = true;
    }
    const h = m.holdout;
    return { version: p.version, train: m.train.score, holdout: h.score, satisfaction: h.satisfaction, profit: h.profit_per_shopper, slow: h.slow_units_per_100, conversion: h.conversion };
  });
  if (dirty) saveState(s);
  return out;
}
