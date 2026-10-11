"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { frontSprite, productShot } from "@/components/store3d/shots";
import { usd } from "@/lib/client";
import type { Product } from "@/lib/types";

/** Every product's image (real photo or 3D studio render), with a PNG download for listings. */
function Card({ p, cutout }: { p: Product; cutout: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    setSrc(null);
    (cutout ? frontSprite(p).then((s) => s.url) : productShot(p, "hero", 640)).then(setSrc).catch(() => setSrc(null));
  }, [p, cutout]);
  return (
    <figure className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex aspect-square items-center justify-center bg-gradient-to-b from-white to-stone-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={p.title} className={`h-full w-full ${!cutout && p.image_url ? "object-cover" : "object-contain"}`} /> : <span className="text-xs text-stone-400">rendering…</span>}
      </div>
      <figcaption className="flex items-start justify-between gap-2 p-2.5 text-xs">
        <span>
          <span className="block font-medium text-stone-900">{p.title}</span>
          <span className="text-stone-500">
            {usd(p.price_cents)} · {p.source === "inventory" ? "in store" : "partner"} · {cutout ? "cut-out" : p.image_url ? "photo" : p.model_url ? "3D scan" : "3D render"}
          </span>
          {!cutout && p.image_credit && (
            <a href={p.image_credit.source_url ?? undefined} target="_blank" rel="noopener noreferrer" className="block truncate text-[10px] text-stone-400 hover:underline" title={p.image_credit.text}>
              {p.image_credit.creator ?? "photo"} · {p.image_credit.license}
            </a>
          )}
        </span>
        {src && !p.image_url && (
          <a href={src} download={`${p.id}.png`} className="shrink-0 text-stone-500 hover:underline">
            PNG
          </a>
        )}
      </figcaption>
    </figure>
  );
}

export default function CatalogPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [filter, setFilter] = useState<"inventory" | "external">("inventory");
  const [cutout, setCutout] = useState(false);
  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => setItems([...d.inventory, ...d.external]));
  }, []);
  const shown = items.filter((p) => p.source === filter);
  return (
    <main className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Product images</h1>
          <p className="text-sm text-stone-600">
            Real photos where a product has one (openly licensed, credited below each), otherwise a studio render of its 3D model. Cut-outs are what photo try-on uses.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {(["inventory", "external"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 ${filter === f ? "bg-stone-900 text-white" : "border border-stone-300 bg-white"}`}>
              {f === "inventory" ? "Your stock" : "Partner catalog"}
            </button>
          ))}
          <label className="flex items-center gap-1.5 px-2 text-stone-600">
            <input type="checkbox" checked={cutout} onChange={(e) => setCutout(e.target.checked)} />
            Cut-outs
          </label>
          <Link href="/" className="rounded-lg px-3 py-1.5 text-stone-500">
            Store
          </Link>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {shown.map((p) => (
          <Card key={p.id} p={p} cutout={cutout} />
        ))}
      </div>
    </main>
  );
}
