"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usd } from "@/lib/client";
import type { Product } from "@/lib/types";

interface RackItem {
  product_id: string;
  prompt: string;
  grasp: "top" | "side";
  product: Product;
}

interface ArmStatus {
  phase: string;
  detail: string;
  running: boolean;
  item: string | null;
  last: { item: string; ok: boolean; how: string; detail?: string; seconds: number } | null;
}

interface State {
  arm_url: string;
  online: boolean;
  status: ArmStatus | null;
  rack: RackItem[];
}

const STEPS = ["Find", "Grab", "Bring", "Take it", "Done"] as const;

function stepOf(phase: string): number {
  if (["FIND", "SCAN", "LOOK", "PROBE", "AIM"].includes(phase)) return 0;
  if (["REACH", "APPROACH", "TRIM", "HOVER", "STAND", "TWIST", "ALIGN", "DESCEND", "GRASP", "LIFT"].includes(phase)) return 1;
  if (phase === "BRING") return 2;
  if (phase === "OFFER") return 3;
  if (phase === "DONE" || phase === "RETURN") return 4;
  return -1;
}

export default function RobotPage() {
  const [s, setS] = useState<State | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/robot")
      .then((r) => r.json())
      .then(setS)
      .catch(() => setError("Couldn't reach the store server."));

  useEffect(() => {
    load();
    const t = setInterval(load, 600);
    return () => clearInterval(t);
  }, []);

  const send = async (body: object) => {
    setError(null);
    const r = await fetch("/api/robot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "The arm said no.");
    load();
  };

  if (!s) return <main className="p-6 text-sm text-stone-500">Loading…</main>;

  const st = s.status;
  const running = !!st?.running;
  const step = st && running ? stepOf(st.phase) : -1;
  const offering = running && st?.phase === "OFFER";
  const fetchingId = running ? s.rack.find((r) => r.prompt === st?.item)?.product_id : undefined;

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Robot assistant</h1>
          <p className="text-sm text-stone-600">Pick a piece and the arm brings it to you.</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${s.online ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}
          >
            {s.online ? "Arm online" : "Arm offline"}
          </span>
          <Link href="/" className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm text-white">
            Back to store
          </Link>
        </div>
      </header>

      {!s.online && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Start the arm server on the machine with the SO-101:
          <code className="mt-2 block rounded bg-white/70 p-2 text-xs">python examples/handoff/server.py --arm so101 --port &lt;serial port&gt;</code>
          <span className="mt-1 block text-xs">Looking for it at {s.arm_url} (set ROBOT_ARM_URL to change).</span>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[1fr_420px]">
        <section className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {s.rack.map((it) => (
              <div
                key={it.product_id}
                className={`flex items-center gap-4 rounded-2xl border bg-white p-4 ${fetchingId === it.product_id ? "border-stone-900 ring-2 ring-stone-900" : "border-stone-200"}`}
              >
                <div className="h-16 w-16 shrink-0 rounded-xl border border-stone-200" style={{ background: it.product.color.hex }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.product.title}</div>
                  <div className="text-xs text-stone-500">
                    {it.product.color.name} · {usd(it.product.price_cents, it.product.currency)}
                  </div>
                  <button
                    disabled={!s.online || running}
                    onClick={() => send({ action: "fetch", item: it.prompt, grasp: it.grasp })}
                    className="mt-2 rounded-lg bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                  >
                    {fetchingId === it.product_id ? "On its way…" : "Hand it to me"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form
            className="flex gap-2 rounded-2xl border border-stone-200 bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) send({ action: "fetch", item: custom.trim(), grasp: "top" });
            }}
          >
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Something else on the table, e.g. “black cap”"
              className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
            />
            <button disabled={!s.online || running} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm disabled:opacity-40">
              Fetch
            </button>
          </form>
        </section>

        <aside className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-900">
            {s.online ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${s.arm_url}/stream`} alt="Wrist camera" className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center text-sm text-stone-400">No camera</div>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <ol className="flex justify-between text-xs">
              {STEPS.map((label, i) => (
                <li key={label} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${i < step ? "bg-stone-900" : i === step ? "animate-pulse bg-emerald-500" : "bg-stone-200"}`}
                  />
                  <span className={i === step ? "font-semibold" : "text-stone-500"}>{label}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 min-h-5 text-center text-sm text-stone-600">
              {running ? st?.detail : st?.last ? (st.last.ok ? `Handed over: ${st.last.item}` : `${st.last.item}: ${st.last.detail ?? st.last.how}`) : "Ready"}
            </p>

            {offering && (
              <button onClick={() => send({ action: "taken" })} className="mt-3 w-full rounded-xl bg-emerald-600 py-4 text-lg font-semibold text-white">
                Got it ✓
              </button>
            )}
            {running && (
              <button onClick={() => send({ action: "cancel" })} className="mt-2 w-full rounded-xl border border-red-300 py-2 text-sm font-medium text-red-700">
                Stop the arm
              </button>
            )}
            {error && <p className="mt-2 text-center text-xs text-red-700">{error}</p>}
          </div>
        </aside>
      </div>
    </main>
  );
}
