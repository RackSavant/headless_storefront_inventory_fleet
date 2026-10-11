/**
 * Headroom check for the harness: scores the seed policy against an "oracle"
 * that knows the simulator's hidden truth, plus single-knob sweeps. If the
 * oracle doesn't beat the seed, there's nothing for the agent to learn.
 *   npx tsx scripts/sim-oracle.ts
 */
import { allProducts, loadCatalog } from "../lib/catalog";
import { applyPatch, seedPolicy } from "../lib/harness/policy";
import { evaluate, generateShoppers, PANELS } from "../lib/harness/simulator";
import type { PatchOp } from "../lib/harness/types";
const { inventory, config } = loadCatalog();
const catalog = allProducts();
const seed = seedPolicy(config);
const hidden: Array<[string, string, number]> = [
  ["denim-jacket", "slim-jean|straight-jean", -0.3], ["loafer", "wide-leg-trouser|midi-skirt", 0.15],
  ["tote|backpack", "cocktail-dress|slip-dress|silk-camisole|tailored-trouser|wide-leg-trouser", -0.25],
  ["belt", "slip-dress|cocktail-dress|knit-midi-dress|sundress|maxi-dress", -0.25], ["chelsea-boot|ankle-boot", "knit-midi-dress|midi-skirt", 0.15],
  ["hoodie", "tailored-blazer|wool-coat|trench-coat", -0.3], ["clutch", "cocktail-dress|slip-dress", 0.15],
  ["socks", "loafer|oxford|derby|chelsea-boot", 0.12], ["leather-jacket", "slip-dress|mini-skirt|band-tee", 0.15], ["cargo-pant", "tailored-blazer|silk-camisole", -0.2],
];
const ops: PatchOp[] = hidden.map(([a, b, bonus]) => ({ op: "add_rule", a, b, bonus }));
const seg = (segment: any, w: Record<string, number>) => Object.entries(w).map(([key, value]) => ({ op: "set_weight" as const, key, value, segment }));
ops.push(...seg("occasion:formal", { color: 0.25, style: 0.25, formality: 0.4, season: 0.1 }), ...seg("occasion:casual", { color: 0.5, style: 0.3, formality: 0.1, season: 0.1 }), ...seg("occasion:active", { color: 0.5, style: 0.3, formality: 0.1, season: 0.1 }));
const { policy: oracle, violations } = applyPatch(seed, { ops, rationale: "oracle" });
console.log("violations", violations);
for (const [name, p] of Object.entries(PANELS)) {
  const sh = generateShoppers(p.seed, p.n, inventory);
  const a = evaluate(seed, sh, catalog).metrics, b = evaluate(oracle, sh, catalog).metrics;
  console.log(name, "seed", a.score.toFixed(1), "sat", a.satisfaction.toFixed(3), "$", a.profit_per_shopper.toFixed(1), "| oracle", b.score.toFixed(1), "sat", b.satisfaction.toFixed(3), "$", b.profit_per_shopper.toFixed(1));
}
for (const [k, v] of [["bundle_discount_2", 5], ["bundle_discount_2", 15], ["bundle_discount_3", 10], ["bundle_discount_3", 20], ["inventory_boost", 0.0], ["inventory_boost", 0.12], ["slow_mover_extra_pct", 0], ["slow_mover_extra_pct", 10]] as const) {
  const { policy } = applyPatch(seed, { ops: [{ op: "set_config", key: k, value: v }], rationale: "" });
  const sh = generateShoppers(PANELS.train.seed, PANELS.train.n, inventory);
  const m = evaluate(policy, sh, catalog).metrics;
  console.log(k, v, m.score.toFixed(1), "sat", m.satisfaction.toFixed(3), "$", m.profit_per_shopper.toFixed(1), "slow", m.slow_units_per_100.toFixed(0), "mr", m.margin_rate.toFixed(2));
}
