"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usd } from "@/lib/client";
import type { computeInsights } from "@/lib/insights";

type Insights = ReturnType<typeof computeInsights>;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {note && <div className="mt-0.5 text-xs text-stone-500">{note}</div>}
    </div>
  );
}

export default function OwnerPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState(false);

  const load = () =>
    fetch("/api/insights")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError(true));
  useEffect(() => {
    load();
  }, []);

  if (error) return <main className="p-6 text-sm">Couldn&apos;t load insights.</main>;
  if (!data) return <main className="p-6 text-sm text-stone-500">Loading…</main>;
  const { totals, funnel } = data;
  const maxDemand = Math.max(1, ...data.demand.map((d) => d.gap_hits * 2 + d.shown + d.clicks * 5));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{data.store_name} · Owner</h1>
          <p className="text-sm text-stone-600">What&apos;s sitting, what bundles are moving, and what shoppers need that you don&apos;t sell.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm">Refresh</button>
          <Link href="/" className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm text-white">Open store</Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Units in stock" value={String(totals.units)} note={`${totals.skus} SKUs`} />
        <Stat label="Stock at retail" value={usd(totals.retail_value_cents)} note={`${usd(totals.cost_value_cents)} at cost`} />
        <Stat label="Slow movers" value={String(totals.slow_movers)} note={`${usd(totals.slow_mover_value_cents)} at retail, boosted in bundles`} />
        <Stat label="Revenue (demo checkouts)" value={usd(funnel.revenue_cents)} note={`${funnel.checkouts} orders · ${funnel.bundle_adds} bundles added`} />
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold">Shopper funnel</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm md:grid-cols-7">
          {[
            ["Shoppers", funnel.shoppers],
            ["Item views", funnel.views],
            ["Try-ons", funnel.try_ons],
            ["Looks shown", funnel.looks_shown],
            ["Partner clicks", funnel.partner_clicks],
            ["Bundles added", funnel.bundle_adds],
            ["Checkouts", funnel.checkouts],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-stone-50 p-2">
              <div className="text-lg font-semibold tabular-nums">{v}</div>
              <div className="text-[11px] text-stone-500">{k}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold">Stock this next</h2>
        <p className="mb-3 text-xs text-stone-500">
          Partner categories your outfits keep reaching for. “Outfit gaps” runs the stylist over every item you stock; “shown” and “clicks” come from real shoppers.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Category</th>
                <th className="py-1.5 pr-3 font-medium">Demand</th>
                <th className="py-1.5 pr-3 text-right font-medium">Outfit gaps</th>
                <th className="py-1.5 pr-3 text-right font-medium">Shown</th>
                <th className="py-1.5 pr-3 text-right font-medium">Clicks</th>
                <th className="py-1.5 pr-3 text-right font-medium">Avg price</th>
                <th className="py-1.5 font-medium">Examples</th>
              </tr>
            </thead>
            <tbody>
              {data.demand.map((d) => (
                <tr key={d.key} className="border-t border-stone-100">
                  <td className="py-2 pr-3 font-medium capitalize">{d.label}</td>
                  <td className="py-2 pr-3">
                    <div className="h-1.5 w-28 rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${((d.gap_hits * 2 + d.shown + d.clicks * 5) / maxDemand) * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{d.gap_hits}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{d.shown}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{d.clicks}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{usd(d.avg_price_cents)}</td>
                  <td className="max-w-[260px] truncate py-2 text-xs text-stone-500">{d.examples.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold">Inventory pressure</h2>
        <p className="mb-3 text-xs text-stone-500">
          Older and deeper stock gets a bigger boost in recommendations and an extra {data.config.slow_mover_extra_pct}% in bundles (never below cost + {data.config.min_margin_pct}%).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Item</th>
                <th className="py-1.5 pr-3 font-medium">Pressure</th>
                <th className="py-1.5 pr-3 text-right font-medium">Qty</th>
                <th className="py-1.5 pr-3 text-right font-medium">Days</th>
                <th className="py-1.5 pr-3 text-right font-medium">Views</th>
                <th className="py-1.5 pr-3 text-right font-medium">Try-ons</th>
                <th className="py-1.5 pr-3 text-right font-medium">In looks</th>
                <th className="py-1.5 text-right font-medium">Bundled</th>
              </tr>
            </thead>
            <tbody>
              {data.stock.map((s) => (
                <tr key={s.id} className="border-t border-stone-100">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full border border-stone-300" style={{ background: s.color.hex }} />
                      <span className="font-medium">{s.title}</span>
                      {s.slow_mover && <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800">SLOW</span>}
                    </div>
                    <div className="text-[11px] text-stone-400">{s.sku} · {usd(s.price_cents)}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="h-1.5 w-24 rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${s.pressure * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.quantity}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.days_in_stock}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.views}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.try_ons}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.shown_in_looks}</td>
                  <td className="py-2 text-right tabular-nums">{s.bundle_adds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
