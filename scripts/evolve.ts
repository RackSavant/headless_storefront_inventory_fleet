/**
 * Run the self-improvement loop from the terminal.
 *   npm run harness:evolve -- 20                 # 20 generations, offline heuristic proposer
 *   npm run harness:evolve -- 5 --claude         # Claude proposer (needs ANTHROPIC_API_KEY)
 *   npm run harness:evolve -- 20 --reset         # start again from the seed policy
 */
import { describeOp } from "../lib/harness/policy";
import { activePolicy, evolve, loadState, resetState, versionScores } from "../lib/harness/evolve";

const argv = process.argv.slice(2);
const n = Number(argv.find((a) => /^\d+$/.test(a)) ?? 10);
if (argv.includes("--reset")) resetState();
const proposer = argv.includes("--claude") ? "claude" : "heuristic";

const before = loadState();
const t0 = performance.now();
const { state, records } = await evolve(n, proposer);
for (const g of records) {
  const d = g.holdout ? g.holdout.candidate.score - g.holdout.incumbent.score : g.train ? g.train.candidate.score - g.train.incumbent.score : null;
  console.log(
    `gen ${String(g.gen).padStart(3)} ${g.status.padEnd(16)} ${g.kind.padEnd(7)} ${d === null ? "      " : (d >= 0 ? "+" : "") + d.toFixed(2).padStart(5)}  ${g.patch.ops.map(describeOp).join("; ")}`,
  );
  for (const v of g.violations) console.log(`        ! ${v}`);
  for (const c of g.tool_calls ?? []) if (c.tool === "what_if") console.log(`        ~ ${c.summary}`);
  if (g.note && g.status !== "rejected") console.log(`        > ${g.note}`);
}
const scores = versionScores(state);
const first = scores[0];
const last = scores.find((x) => x.version === state.active_version)!;
console.log(`\n${records.length} generations in ${((performance.now() - t0) / 1000).toFixed(1)}s. Policy v${before.active_version} -> v${state.active_version}`);
console.log(`held-out score ${first.holdout.toFixed(2)} (seed) -> ${last.holdout.toFixed(2)}  satisfaction ${first.satisfaction.toFixed(3)} -> ${last.satisfaction.toFixed(3)}  profit/shopper $${first.profit.toFixed(2)} -> $${last.profit.toFixed(2)}`);
const p = activePolicy(state);
console.log(`context: ${JSON.stringify(p.context)}  agent tools: ${JSON.stringify(p.agent_tools)}`);
