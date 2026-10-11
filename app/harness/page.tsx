"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { describeOp } from "@/lib/harness/policy";
import type { Generation, Guardrail, Policy } from "@/lib/harness/types";

interface Snapshot {
  active_version: number;
  policy: Policy;
  seed: Policy;
  versions: Array<{ version: number; parent: number | null; author: string; rationale: string; created_at: string }>;
  scores: Array<{ version: number; train: number; holdout: number; satisfaction: number; profit: number; slow: number; conversion: number }>;
  generations: Generation[];
  trial: { gen: number; until_gen: number; baseline_rate: number } | null;
  claude_auth: "api_key" | "auth_token" | "oauth_profile" | "claude_code" | null;
}

const STATUS_STYLE: Record<string, string> = {
  promoted: "bg-emerald-50 text-emerald-800",
  approved: "bg-emerald-50 text-emerald-800",
  trial: "bg-sky-50 text-sky-800",
  pending_approval: "bg-amber-50 text-amber-800",
  rejected: "bg-stone-100 text-stone-600",
  declined: "bg-stone-100 text-stone-600",
  blocked: "bg-red-50 text-red-700",
  reverted: "bg-violet-50 text-violet-700",
};

const SERIES = { holdout: "#2a78d6", train: "#eb6834" };

function pct(a: number, b: number) {
  return `${b >= a ? "+" : ""}${(((b - a) / a) * 100).toFixed(1)}%`;
}

function Tile({ label, seed, now, fmt }: { label: string; seed: number; now: number; fmt: (n: number) => string }) {
  const up = now >= seed;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{fmt(now)}</span>
        <span className={`text-xs font-medium tabular-nums ${up ? "text-emerald-700" : "text-red-700"}`}>{pct(seed, now)}</span>
      </div>
      <div className="mt-0.5 text-xs text-stone-500">seed policy {fmt(seed)}</div>
    </div>
  );
}

/** Held-out and training score per policy version. One axis, two series, hover per version. */
function ScoreChart({ scores, active }: { scores: Snapshot["scores"]; active: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (scores.length < 2) return <p className="py-10 text-center text-sm text-stone-500">Run a few generations to see the policy improve.</p>;
  const W = 720;
  const H = 220;
  const pad = { l: 44, r: 70, t: 12, b: 28 };
  const vals = scores.flatMap((s) => [s.train, s.holdout]);
  // Round ticks: pick the smallest of 1/2/5/10 that keeps at most 6 gridlines.
  const span = Math.max(...vals) - Math.min(...vals) + 2;
  const step = [1, 2, 5, 10, 20].find((st) => span / st <= 5) ?? 50;
  const lo = Math.floor((Math.min(...vals) - 1) / step) * step;
  const hi = Math.ceil((Math.max(...vals) + 1) / step) * step;
  const x = (i: number) => pad.l + (i / (scores.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = (k: "train" | "holdout") => scores.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const last = scores.length - 1;
  const h = hover !== null ? scores[hover] : null;

  return (
    <div className="relative">
      <div className="mb-2 flex gap-4 text-xs text-stone-600">
        {(["holdout", "train"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: SERIES[k] }} />
            {k === "holdout" ? "Held-out shoppers" : "Training shoppers"}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Policy score by version" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e7e5e4" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="fill-stone-500" fontSize={11}>
              {t.toFixed(0)}
            </text>
          </g>
        ))}
        {scores.map((s, i) => (
          <text key={s.version} x={x(i)} y={H - 8} textAnchor="middle" className="fill-stone-500" fontSize={10}>
            {scores.length <= 24 || i % Math.ceil(scores.length / 24) === 0 ? `v${s.version}` : ""}
          </text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#a8a29e" strokeWidth={1} />}
        {(["train", "holdout"] as const).map((k) => (
          <g key={k}>
            <path d={line(k)} fill="none" stroke={SERIES[k]} strokeWidth={2} strokeLinejoin="round" />
            {scores.map((s, i) => (
              <circle key={i} cx={x(i)} cy={y(s[k])} r={s.version === active || hover === i ? 4.5 : 3} fill={SERIES[k]} stroke="#fff" strokeWidth={2} />
            ))}
            <text x={x(last) + 8} y={y(scores[last][k]) + 4} fontSize={11} className="fill-stone-700">
              {scores[last][k].toFixed(1)}
            </text>
          </g>
        ))}
        {scores.map((s, i) => (
          <rect
            key={`hit${i}`}
            x={x(i) - (W - pad.l - pad.r) / (scores.length - 1) / 2}
            y={pad.t}
            width={(W - pad.l - pad.r) / (scores.length - 1)}
            height={H - pad.t - pad.b}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: `min(calc(${(x(hover!) / W) * 100}% + 12px), calc(100% - 190px))` }}
        >
          <div className="mb-1 font-semibold text-stone-900">Policy v{h.version}</div>
          <div className="text-stone-700">Held-out score {h.holdout.toFixed(2)}</div>
          <div className="text-stone-700">Training score {h.train.toFixed(2)}</div>
          <div className="text-stone-500">Profit ${h.profit.toFixed(2)} / shopper</div>
          <div className="text-stone-500">Satisfaction {(h.satisfaction * 100).toFixed(1)}%</div>
        </div>
      )}
    </div>
  );
}

function GenerationRow({ g, onDecide, busy }: { g: Generation; onDecide: (gen: number, d: "approve" | "decline") => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const d = g.holdout ? g.holdout.candidate.score - g.holdout.incumbent.score : g.train ? g.train.candidate.score - g.train.incumbent.score : null;
  return (
    <li className="border-t border-stone-100 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 text-xs tabular-nums text-stone-400">gen {g.gen}</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[g.status]}`}>{g.status.replace("_", " ")}</span>
        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">{g.kind === "harness" ? "changes the agent" : "changes the store"}</span>
        <span className="text-[11px] text-stone-400">{g.proposer}</span>
        {d !== null && (
          <span className={`ml-auto text-xs font-medium tabular-nums ${d > 0 ? "text-emerald-700" : "text-stone-500"}`}>
            {g.holdout ? "held-out" : "train"} {d >= 0 ? "+" : ""}
            {d.toFixed(2)}
          </span>
        )}
      </div>
      <div className="mt-1.5 pl-14 text-sm text-stone-900">{g.patch.ops.map(describeOp).join(" · ")}</div>
      <div className="mt-0.5 pl-14 text-xs text-stone-600">{g.patch.rationale}</div>
      {g.violations.map((v) => (
        <div key={v} className="mt-1 pl-14 text-xs text-red-700">
          Guardrail: {v}
        </div>
      ))}
      {g.note && <div className="mt-1 pl-14 text-xs text-stone-500">{g.note}</div>}
      {g.status === "pending_approval" && (
        <div className="mt-2 flex gap-2 pl-14">
          <button disabled={busy} onClick={() => onDecide(g.gen, "approve")} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
            Approve
          </button>
          <button disabled={busy} onClick={() => onDecide(g.gen, "decline")} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs disabled:opacity-40">
            Decline
          </button>
        </div>
      )}
      {!!g.tool_calls?.length && (
        <div className="mt-1 pl-14">
          <button onClick={() => setOpen(!open)} className="text-[11px] text-stone-500 hover:underline">
            {open ? "Hide" : "Show"} {g.tool_calls.length} agent tool call{g.tool_calls.length > 1 ? "s" : ""}
          </button>
          {open && (
            <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-stone-600">
              {g.tool_calls.map((c, i) => (
                <li key={i}>
                  {c.tool}: {c.summary}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function Changed({ on }: { on: boolean }) {
  return on ? <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] font-medium text-sky-800">evolved</span> : null;
}

function Architecture({ p, seed }: { p: Policy; seed: Policy }) {
  const agentRules = [...p.rules.filter((r) => r.origin !== "seed"), ...Object.entries(p.segments).flatMap(([seg, o]) => (o?.rules ?? []).map((r) => ({ ...r, seg })))];
  const removed = seed.rules.filter((r) => !p.rules.some((x) => x.id === r.id));
  const row = (k: string, v: string, changed: boolean) => (
    <div key={k} className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-stone-600">{k}</span>
      <span className="text-right font-medium tabular-nums">
        {v}
        <Changed on={changed} />
      </span>
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-semibold">What the agent sees (context policy)</h3>
        {row("Failure examples", String(p.context.failure_examples), p.context.failure_examples !== seed.context.failure_examples)}
        {row("Segment metrics", p.context.include_segments ? "on" : "off", p.context.include_segments !== seed.context.include_segments)}
        {row("Memory of past attempts", `${p.context.include_history} generations`, p.context.include_history !== seed.context.include_history)}
        {row("Full rule list", p.context.include_rules ? "on" : "off", p.context.include_rules !== seed.context.include_rules)}
        <h3 className="mt-4 text-sm font-semibold">Agent tools</h3>
        {Object.entries(p.agent_tools).map(([k, v]) => row(k, v ? "granted" : "not granted", v !== seed.agent_tools[k as keyof Policy["agent_tools"]]))}
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-semibold">Guardrails</h3>
        <ul className="mt-1 space-y-1.5">
          {p.guardrails.map((g: Guardrail) => (
            <li key={g.id} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-medium">
                  {g.locked ? "🔒 " : ""}
                  {g.id}
                </span>
                <span className="tabular-nums">
                  {g.value}
                  <Changed on={g.value !== seed.guardrails.find((x) => x.id === g.id)?.value} />
                </span>
              </div>
              <div className="text-xs text-stone-500">
                {g.description} · checked {g.stage === "policy" ? "before testing" : "on held-out shoppers"}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-stone-500">Locked guardrails can be tightened by the agent, never loosened.</p>
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-semibold">Store settings and features</h3>
        {row("In-store boost", String(p.config.inventory_boost), p.config.inventory_boost !== seed.config.inventory_boost)}
        {row("Bundle discount (2 / 3 items)", `${p.config.bundle_discounts["2"]}% / ${p.config.bundle_discounts["3"]}%`, JSON.stringify(p.config.bundle_discounts) !== JSON.stringify(seed.config.bundle_discounts))}
        {row("Slow-mover extra discount", `${p.config.slow_mover_extra_pct}%`, p.config.slow_mover_extra_pct !== seed.config.slow_mover_extra_pct)}
        {row("Slow mover after", `${p.config.slow_mover_days} days`, p.config.slow_mover_days !== seed.config.slow_mover_days)}
        {row("Protect categories with", `${p.config.protect_min_items}+ items`, p.config.protect_min_items !== seed.config.protect_min_items)}
        {Object.entries(p.tools).map(([k, v]) => row(k.replace(/_/g, " "), v ? "on" : "off", v !== seed.tools[k as keyof Policy["tools"]]))}
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-semibold">How outfits are scored</h3>
        {(["color", "style", "formality", "season"] as const).map((k) => row(`${k} weight`, p.weights[k].toFixed(2), p.weights[k] !== seed.weights[k]))}
        {Object.entries(p.segments).map(([seg, o]) =>
          o?.weights ? (
            <div key={seg} className="py-1 text-sm">
              <span className="text-stone-600">{seg} override</span>{" "}
              <span className="font-medium">{Object.entries(o.weights).map(([k, v]) => `${k} ${v}`).join(", ")}</span>
              <Changed on />
            </div>
          ) : null,
        )}
        <h3 className="mt-3 text-sm font-semibold">
          Stylist rules: {p.rules.length} ({agentRules.length} learned{removed.length ? `, ${removed.length} removed` : ""})
        </h3>
        <ul className="mt-1 space-y-1">
          {agentRules.map((r) => (
            <li key={r.id} className="text-xs">
              <span className={`font-medium ${r.bonus < 0 ? "text-red-700" : "text-emerald-700"}`}>
                {r.bonus > 0 ? "+" : ""}
                {r.bonus}
              </span>{" "}
              {r.a.replace(/[\^$\\]/g, "")} with {r.b.replace(/[\^$\\]/g, "")}
              {"seg" in r ? ` (${(r as { seg: string }).seg})` : ""} <span className="text-stone-500">· {r.reason}</span>
            </li>
          ))}
          {!agentRules.length && <li className="text-xs text-stone-500">None yet.</li>}
        </ul>
      </section>
    </div>
  );
}

export default function HarnessPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => fetch("/api/harness").then((r) => r.json()).then(setData), []);
  useEffect(() => {
    load().catch(() => setError("Couldn't load the harness"));
  }, [load]);

  const act = async (label: string, body: Record<string, unknown>) => {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch("/api/harness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "failed");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <main className="p-6 text-sm text-stone-500">{error ?? "Loading…"}</main>;
  const seed = data.scores[0];
  const now = data.scores.find((s) => s.version === data.active_version) ?? seed;
  const gens = [...data.generations].reverse();
  const pending = gens.filter((g) => g.status === "pending_approval");
  const counts = data.generations.reduce<Record<string, number>>((m, g) => ((m[g.status] = (m[g.status] ?? 0) + 1), m), {});

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Self-improving stylist</h1>
          <p className="max-w-2xl text-sm text-stone-600">
            An agent proposes changes to how the store styles and sells: rules, weights, discounts, features, and its own context and tools. Each change is
            tested on simulated shoppers, checked against guardrails, confirmed on shoppers it never saw, and only then goes live. The store is running policy{" "}
            <span className="font-medium">v{data.active_version}</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy} onClick={() => act("1", { action: "evolve", generations: 1, proposer: "heuristic" })} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm disabled:opacity-40">
            {busy === "1" ? "Running…" : "Run 1 generation"}
          </button>
          <button disabled={!!busy} onClick={() => act("5", { action: "evolve", generations: 5, proposer: "heuristic" })} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-40">
            {busy === "5" ? "Running 5…" : "Run 5 generations"}
          </button>
          <button
            disabled={!!busy || !data.claude_auth}
            title={
              data.claude_auth
                ? `Claude proposes the change, using the tools the policy grants it (signed in via ${data.claude_auth === "claude_code" ? "this machine's Claude Code login" : data.claude_auth === "oauth_profile" ? "your ant OAuth profile" : data.claude_auth.replace("_", " ")})`
                : "Sign in with `ant auth login` (OAuth) or set ANTHROPIC_API_KEY to use Claude as the proposer"
            }
            onClick={() => act("claude", { action: "evolve", generations: 1, proposer: "claude" })}
            className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm text-violet-800 disabled:opacity-40"
          >
            {busy === "claude" ? "Claude is thinking…" : "Run with Claude"}
          </button>
          <button
            disabled={!!busy}
            onClick={() => confirm("Reset to the seed policy and erase all generations?") && act("reset", { action: "reset" })}
            className="rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:text-stone-800 disabled:opacity-40"
          >
            Reset
          </button>
          <Link href="/" className="rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:text-stone-800">
            Store
          </Link>
        </div>
      </header>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Held-out score" seed={seed.holdout} now={now.holdout} fmt={(n) => n.toFixed(1)} />
        <Tile label="Profit per shopper" seed={seed.profit} now={now.profit} fmt={(n) => `$${n.toFixed(2)}`} />
        <Tile label="Shopper satisfaction" seed={seed.satisfaction} now={now.satisfaction} fmt={(n) => `${(n * 100).toFixed(1)}%`} />
        <Tile label="Slow-mover units / 100 shoppers" seed={seed.slow} now={now.slow} fmt={(n) => n.toFixed(0)} />
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Score by policy version</h2>
          <span className="text-xs text-stone-500">
            {data.generations.length} generations · {counts.promoted ?? 0} promoted · {counts.rejected ?? 0} rejected · {counts.blocked ?? 0} blocked by guardrails ·{" "}
            {counts.reverted ?? 0} reverted
          </span>
        </div>
        <ScoreChart scores={data.scores} active={data.active_version} />
      </section>

      {pending.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
          <h2 className="text-base font-semibold">Waiting for your approval</h2>
          <p className="text-xs text-stone-600">These passed testing but change what the store offers, so they need a person to sign off.</p>
          <ul>
            {pending.map((g) => (
              <GenerationRow key={g.gen} g={g} busy={!!busy} onDecide={(gen, decision) => act("decide", { action: "decide", gen, decision })} />
            ))}
          </ul>
        </section>
      )}

      {data.trial && (
        <p className="rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
          The agent changed its own setup in gen {data.trial.gen}. It&apos;s on trial until gen {data.trial.until_gen} and will be reverted unless more of its proposals get accepted
          than before ({(data.trial.baseline_rate * 100).toFixed(0)}%).
        </p>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold">Current architecture</h2>
        <Architecture p={data.policy} seed={data.seed} />
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold">Generation log</h2>
        {!gens.length ? (
          <p className="py-4 text-sm text-stone-500">No generations yet. Press “Run 5 generations”.</p>
        ) : (
          <ul>
            {gens.map((g) => (
              <GenerationRow key={g.gen} g={g} busy={!!busy} onDecide={(gen, decision) => act("decide", { action: "decide", gen, decision })} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold">Versions</h2>
        <ul className="mt-2 divide-y divide-stone-100 text-sm">
          {[...data.versions].reverse().map((v) => {
            const sc = data.scores.find((s) => s.version === v.version);
            return (
              <li key={v.version} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-10 font-medium tabular-nums">v{v.version}</span>
                <span className="text-xs text-stone-500">{v.author}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-stone-600">{v.rationale}</span>
                <span className="text-xs tabular-nums text-stone-500">{sc ? sc.holdout.toFixed(1) : ""}</span>
                {v.version === data.active_version ? (
                  <span className="rounded bg-stone-900 px-1.5 py-0.5 text-[11px] text-white">live</span>
                ) : (
                  <button disabled={!!busy} onClick={() => act("rollback", { action: "rollback", version: v.version })} className="text-xs text-stone-500 hover:underline disabled:opacity-40">
                    Make live
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
