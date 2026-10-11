"use client";

import { useMemo } from "react";
import { usd } from "@/lib/client";
import { genderCompatible, pairScore } from "@/lib/reco/compat";
import type { Gender, Product, Role, ScoringPolicy } from "@/lib/types";
import { SourceBadge } from "./LookCard";
import Swatch from "./Swatch";

const LABEL: Record<Role, string> = {
  outerwear: "Jacket",
  top: "Top",
  dress: "Dress",
  bottom: "Bottom",
  shoes: "Shoes",
  bag: "Bag",
  accessory: "Accessory",
};

export function outfitMatch(items: Product[], scoring?: ScoringPolicy) {
  const pairs: Array<{ a: Product; b: Product; total: number; reason: string }> = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const s = pairScore(items[i], items[j], scoring);
      pairs.push({ a: items[i], b: items[j], total: s.total, reason: s.reasons[0] ?? "" });
    }
  const mean = pairs.length ? pairs.reduce((s, p) => s + p.total, 0) / pairs.length : 0;
  return { mean, clashes: pairs.filter((p) => p.total < 0.45).sort((x, y) => x.total - y.total) };
}

/** Put a product on the mannequin: one item per role; a dress replaces separates and vice versa. */
export function wear(outfit: Product[], p: Product): Product[] {
  let next = outfit.filter((o) => o.role !== p.role);
  if (p.role === "dress") next = next.filter((o) => o.role !== "top" && o.role !== "bottom");
  if (p.role === "top" || p.role === "bottom") next = next.filter((o) => o.role !== "dress");
  return [...next, p];
}

export default function MixMatch({
  outfit,
  catalog,
  gender,
  onChange,
  onStyleMe,
  onInspect,
  styling,
  scoring,
}: {
  outfit: Product[];
  catalog: Product[];
  gender: Gender | "all";
  onChange: (o: Product[]) => void;
  onStyleMe: () => void;
  onInspect: (p: Product) => void;
  styling: boolean;
  scoring?: ScoringPolicy;
}) {
  const dressMode = outfit.some((p) => p.role === "dress");
  const slots: Role[] = dressMode
    ? ["outerwear", "dress", "shoes", "bag", "accessory"]
    : ["outerwear", "top", "bottom", "shoes", "bag", "accessory"];
  const anchorGender = outfit.find((p) => p.gender !== "unisex")?.gender ?? (gender === "all" ? undefined : gender);

  const ranked = useMemo(() => {
    const out = {} as Record<Role, Product[]>;
    for (const role of slots) {
      const others = outfit.filter((p) => p.role !== role);
      out[role] = catalog
        .filter((p) => p.role === role && (p.source === "external" || (p.quantity ?? 0) > 0))
        .filter((p) => !anchorGender || genderCompatible(p.gender, anchorGender))
        .map((p) => ({
          p,
          s: others.length ? others.reduce((sum, o) => sum + pairScore(p, o, scoring).total, 0) / others.length : 0.5,
        }))
        // in-store first at equal-ish compatibility, so mixing defaults to your stock
        .sort((a, b) => b.s + (b.p.source === "inventory" ? 0.05 : 0) - (a.s + (a.p.source === "inventory" ? 0.05 : 0)))
        .map((x) => x.p);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outfit, catalog, anchorGender, dressMode, scoring]);

  const match = outfitMatch(outfit, scoring);
  const total = outfit.reduce((s, p) => s + p.price_cents, 0);

  const step = (role: Role, dir: 1 | -1) => {
    const list = ranked[role];
    if (!list.length) return;
    const cur = outfit.find((p) => p.role === role);
    const idx = cur ? list.findIndex((p) => p.id === cur.id) : -1;
    const next = list[(idx + dir + list.length) % list.length];
    onChange(wear(outfit, next));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Mix &amp; match</h2>
          <p className="text-xs text-stone-500">Arrows cycle through pieces ranked by how well they go with the rest.</p>
        </div>
        <div className="flex rounded-lg border border-stone-200 p-0.5 text-[11px]">
          <button
            className={`rounded-md px-2 py-1 ${!dressMode ? "bg-stone-900 text-white" : "text-stone-600"}`}
            onClick={() => dressMode && onChange(outfit.filter((p) => p.role !== "dress"))}
          >
            Separates
          </button>
          <button
            className={`rounded-md px-2 py-1 ${dressMode ? "bg-stone-900 text-white" : "text-stone-600"}`}
            disabled={anchorGender === "men"}
            onClick={() => {
              if (dressMode) return;
              const d = ranked.dress?.[0] ?? catalog.find((p) => p.role === "dress");
              if (d) onChange(wear(outfit, d));
            }}
          >
            Dress
          </button>
        </div>
      </div>

      {outfit.length > 1 && (
        <div className="rounded-xl bg-stone-50 p-3">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="font-medium text-stone-700">Outfit match</span>
            <span className="tabular-nums font-semibold text-stone-900">{Math.round(match.mean * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
            <div
              className={`h-full rounded-full ${match.mean > 0.65 ? "bg-emerald-600" : match.mean > 0.5 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${Math.round(match.mean * 100)}%` }}
            />
          </div>
          {match.clashes.slice(0, 2).map((c) => (
            <p key={c.a.id + c.b.id} className="mt-1.5 text-[11px] text-red-700">
              {c.a.title} + {c.b.title}: {c.reason}
            </p>
          ))}
        </div>
      )}

      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {slots.map((role) => {
          const cur = outfit.find((p) => p.role === role);
          const options = ranked[role]?.length ?? 0;
          return (
            <li key={role} className="flex items-center gap-2 px-2.5 py-2">
              <button className="h-8 w-7 rounded-md text-stone-500 hover:bg-stone-100 disabled:opacity-30" onClick={() => step(role, -1)} disabled={!options} aria-label={`Previous ${LABEL[role]}`}>
                ‹
              </button>
              {cur ? (
                <button onClick={() => onInspect(cur)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <Swatch product={cur} size={36} />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-stone-400">{LABEL[role]}</div>
                    <div className="truncate text-[13px] font-medium text-stone-900">{cur.title}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                      <SourceBadge product={cur} /> {usd(cur.price_cents)}
                    </div>
                  </div>
                </button>
              ) : (
                <button onClick={() => step(role, 1)} disabled={!options} className="flex-1 py-1.5 text-left text-[13px] text-stone-400 disabled:cursor-not-allowed">
                  <div className="text-[10px] uppercase tracking-wide">{LABEL[role]}</div>
                  {options ? "Add one" : "None available"}
                </button>
              )}
              {cur && (
                <button className="h-8 w-6 rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700" onClick={() => onChange(outfit.filter((p) => p.id !== cur.id))} aria-label={`Remove ${cur.title}`}>
                  ×
                </button>
              )}
              <button className="h-8 w-7 rounded-md text-stone-500 hover:bg-stone-100 disabled:opacity-30" onClick={() => step(role, 1)} disabled={!options} aria-label={`Next ${LABEL[role]}`}>
                ›
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-stone-500">
          Outfit total <span className="font-semibold tabular-nums text-stone-900">{usd(total)}</span>
        </span>
        <button
          onClick={onStyleMe}
          disabled={!outfit.length || styling}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-40"
        >
          {styling ? "Styling…" : "Complete this look"}
        </button>
      </div>
    </div>
  );
}
