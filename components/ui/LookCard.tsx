"use client";

import { usd } from "@/lib/client";
import type { Look, Product } from "@/lib/types";
import Swatch from "./Swatch";

export function SourceBadge({ product }: { product: Product }) {
  return product.source === "inventory" ? (
    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">In store</span>
  ) : (
    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">Partner</span>
  );
}

export default function LookCard({
  look,
  onTryOn,
  onAddBundle,
  onAddItem,
  onShopPartner,
  onInspect,
  onTryOnMe,
}: {
  look: Look;
  onTryOn: (look: Look) => void;
  onAddBundle: (look: Look) => void;
  onAddItem: (p: Product) => void;
  onShopPartner: (p: Product, look: Look) => void;
  onInspect: (p: Product) => void;
  onTryOnMe?: (look: Look) => void;
}) {
  const inStore = look.items.filter((i) => i.product.source === "inventory");
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-sm">
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-900">{look.title}</h3>
        <span className="text-[11px] tabular-nums text-stone-500">{Math.round(look.compat * 100)}% match</span>
      </header>
      <p className="mb-3 text-xs leading-relaxed text-stone-600">{look.blurb}</p>
      <ul className="space-y-2">
        {look.items.map(({ product, reasons }) => (
          <li key={product.id} className="flex items-start gap-2.5">
            <button onClick={() => onInspect(product)} className="shrink-0" aria-label={`View ${product.title}`}>
              <Swatch product={product} size={40} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <button onClick={() => onInspect(product)} className="truncate text-left text-[13px] font-medium text-stone-900 hover:underline">
                  {product.title}
                </button>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-500">
                <SourceBadge product={product} />
                <span className="tabular-nums">{usd(product.price_cents)}</span>
                {product.retailer && <span className="truncate">· {product.retailer}</span>}
              </div>
              {reasons.length > 0 && reasons[0] !== "your pick" && <div className="mt-0.5 line-clamp-2 text-[11px] text-stone-500">{reasons.join(" · ")}</div>}
            </div>
            {product.source === "external" ? (
              <button onClick={() => onShopPartner(product, look)} className="shrink-0 rounded-md border border-violet-200 px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50">
                Shop
              </button>
            ) : (
              <button onClick={() => onAddItem(product)} className="shrink-0 rounded-md border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-50">
                Add
              </button>
            )}
          </li>
        ))}
      </ul>
      <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
        <button onClick={() => onTryOn(look)} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700">
          Try this look
        </button>
        {onTryOnMe && (
          <button onClick={() => onTryOnMe(look)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50">
            On me
          </button>
        )}
        {look.bundle ? (
          <button onClick={() => onAddBundle(look)} className="rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-800">
            Add {look.bundle.product_ids.length} in-store pieces · {usd(look.bundle.price_cents)}{" "}
            <span className="text-orange-200 line-through">{usd(look.bundle.list_cents)}</span>
          </button>
        ) : (
          inStore.length === 1 && <span className="text-[11px] text-stone-500">Add one more in-store piece to unlock a bundle discount</span>
        )}
      </footer>
    </article>
  );
}
