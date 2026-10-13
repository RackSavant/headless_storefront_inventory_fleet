"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getShopperId, usd, formatTotals, type CatalogResponse, type InventoryBundle, type LooksResponse } from "@/lib/client";
import { genderCompatible } from "@/lib/reco/compat";
import type { Gender, Look, Product } from "@/lib/types";
import { buildSections } from "./store3d/layout";
import LookCard, { SourceBadge } from "./ui/LookCard";
import MixMatch, { wear } from "./ui/MixMatch";
import { useProductShot } from "./store3d/shots";
import Swatch from "./ui/Swatch";

const TryOnStudio = dynamic(() => import("./tryon/TryOnStudio"), { ssr: false });

const StoreScene = dynamic(() => import("./store3d/StoreScene"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-stone-500">Opening the store…</div>,
});

type CartLine =
  | { id: string; kind: "item"; product: Product }
  | { id: string; kind: "bundle"; title: string; items: Product[]; price_cents: number; list_cents: number };

const DISLIKE_REASONS = ["Too formal", "Too casual", "Not my color", "Not my style", "Don't like the shape"];
const SPLAT_URL = process.env.NEXT_PUBLIC_STORE_WORLD_SPZ || undefined;

export default function StoreApp() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [shopperId, setShopperId] = useState("shp_anonymous");
  const [view, setView] = useState("map");
  const [selected, setSelected] = useState<Product | null>(null);
  const [outfit, setOutfit] = useState<Product[]>([]);
  const [looks, setLooks] = useState<LooksResponse | null>(null);
  const [looksKey, setLooksKey] = useState("");
  const [loadingLooks, setLoadingLooks] = useState(false);
  const [occasionInput, setOccasionInput] = useState("");
  const [occasion, setOccasion] = useState("");
  const [gender, setGender] = useState<Gender | "all">("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [dislikeFor, setDislikeFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [photoTryOn, setPhotoTryOn] = useState<Product[] | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    setShopperId(getShopperId());
    api.catalog().then(setCatalog);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const allProducts = useMemo(() => (catalog ? [...catalog.inventory, ...catalog.external] : []), [catalog]);
  const visible = useCallback((p: Product) => gender === "all" || genderCompatible(p.gender, gender), [gender]);

  // Partner racks restock to show what the current recommendations reach for.
  const priority = useMemo(
    () => [...(selected ? [selected.id] : []), ...(looks ? looks.looks.flatMap((l) => l.items.map((i) => i.product.id)) : [])],
    [looks, selected],
  );
  const sections = useMemo(
    () =>
      catalog
        ? buildSections(catalog.inventory.filter(visible), catalog.external.filter(visible), catalog.protect_min_items, priority)
        : [],
    [catalog, visible, priority],
  );
  const current = sections.find((s) => s.id === view);

  const fetchLooks = useCallback(
    async (anchors: Product[], opts: { occasionText?: string } = {}) => {
      if (!anchors.length) return;
      const id = ++reqId.current;
      const key = anchors.map((a) => a.id).join(",");
      setLoadingLooks(true);
      const body = {
        anchor_ids: anchors.map((a) => a.id),
        shopper_id: shopperId,
        occasion_text: (opts.occasionText ?? occasion) || undefined,
        context: gender === "all" ? undefined : { gender },
      };
      try {
        const res = await api.looks(body);
        if (id !== reqId.current) return;
        setLooks(res);
        setLooksKey(key);
        if (catalog?.llm) {
          // Second pass: Claude rewrites the blurbs; keep the fast deterministic result on screen meanwhile.
          api.looks({ ...body, polish: true }).then((polished) => {
            if (id === reqId.current) setLooks(polished);
          }).catch(() => {});
        }
      } catch {
        if (id === reqId.current) setToast("Couldn't load recommendations");
      } finally {
        if (id === reqId.current) setLoadingLooks(false);
      }
    },
    [shopperId, occasion, gender, catalog?.llm],
  );

  const inspect = useCallback(
    (p: Product) => {
      setSelected(p);
      setDislikeFor(null);
      const home = sections.find((s) => s.products.some((item) => item.id === p.id));
      if (home && view !== "fitting") setView(home.id);
      api.event({ type: "view_item", shopper_id: shopperId, product_id: p.id });
      fetchLooks([p]);
    },
    [sections, view, shopperId, fetchLooks],
  );

  const enterSection = (id: string) => {
    setView(id);
    setSelected(null);
    if (id === "fitting" && outfit.length) fetchLooks(outfit);
  };

  const tryOn = (items: Product[]) => {
    let next = outfit;
    for (const p of items) next = wear(next, p);
    setOutfit(next);
    setView("fitting");
    setSelected(null);
    for (const p of items) api.event({ type: "try_on", shopper_id: shopperId, product_id: p.id });
  };

  const addItem = (p: Product) => {
    if (p.source !== "inventory") return;
    setCart((c) => [...c, { id: `${p.id}_${Date.now()}`, kind: "item", product: p }]);
    api.event({ type: "add_to_cart", shopper_id: shopperId, product_id: p.id });
    setToast(`Added ${p.title}`);
  };

  const addBundle = (title: string, items: Product[], price: number, list: number, lookId?: string) => {
    setCart((c) => [...c, { id: `b_${Date.now()}`, kind: "bundle", title, items, price_cents: price, list_cents: list }]);
    api.event({ type: "bundle_add", shopper_id: shopperId, product_ids: items.map((p) => p.id), look_id: lookId, value_cents: price });
    setToast(`Bundle added · you save ${usd(list - price, items[0]?.currency)}`);
  };

  const addLookBundle = (look: Look) => {
    if (!look.bundle) return;
    const items = look.items.map((i) => i.product).filter((p) => look.bundle!.product_ids.includes(p.id));
    addBundle(look.bundle.label, items, look.bundle.price_cents, look.bundle.list_cents, look.id);
  };

  const shopPartner = (p: Product, look?: Look) => {
    api.event({ type: "external_click", shopper_id: shopperId, product_id: p.id, look_id: look?.id });
    if (p.url) window.open(p.url, "_blank", "noopener,noreferrer");
  };

  const feedback = async (p: Product, verdict: "like" | "dislike", reason?: string) => {
    setDislikeFor(null);
    try {
      const res = await api.feedback({ shopper_id: shopperId, product_id: p.id, verdict, reason });
      const learned = res.learned.map((l) => `${l.key}: ${l.value}`).join(", ");
      setToast(verdict === "like" ? "Saved to your taste profile" : learned ? `Noted — ${learned}` : "Got it, we'll show less like this");
      const anchors = view === "fitting" ? outfit.filter((o) => o.id !== p.id || verdict === "like") : selected && selected.id !== p.id ? [selected] : [];
      if (verdict === "dislike" && view === "fitting") setOutfit(anchors);
      if (anchors.length) fetchLooks(anchors);
    } catch {
      setToast("Couldn't save that");
    }
  };

  const applyOccasion = (e: React.FormEvent) => {
    e.preventDefault();
    setOccasion(occasionInput);
    const anchors = view === "fitting" ? outfit : selected ? [selected] : [];
    if (anchors.length) fetchLooks(anchors, { occasionText: occasionInput });
    else setToast(occasionInput ? "Pick something you like and we'll style it for that" : "Occasion cleared");
  };

  const cartPrices = cart.map((l) => l.kind === "item" ? l.product : { price_cents: l.price_cents, currency: l.items[0]?.currency ?? "USD" as const });
  const cartTotal = formatTotals(cartPrices);
  const checkout = () => {
    if (new Set(cartPrices.map((p) => p.currency)).size > 1) {
      setToast("Check out USD and USDC items separately; no exchange rate is assumed.");
      return;
    }
    api.event({
      type: "checkout",
      shopper_id: shopperId,
      product_ids: cart.flatMap((l) => (l.kind === "item" ? [l.product.id] : l.items.map((p) => p.id))),
      value_cents: cartPrices.reduce((sum, p) => sum + p.price_cents, 0),
      currency: cartPrices[0]?.currency ?? "USD",
    });
    setCart([]);
    setCartOpen(false);
    setToast("Order placed (demo checkout, no payment taken)");
  };

  const looksForSelected = selected && looksKey === selected.id ? looks : null;
  const looksForOutfit = view === "fitting" && looksKey === outfit.map((o) => o.id).join(",") ? looks : null;

  return (
    <div className="relative h-dvh w-full overflow-clip bg-[var(--bg)] text-stone-900">
      {/* 3D store */}
      <div className="absolute inset-0">
        {catalog && (
          <StoreScene
            sections={sections}
            view={view}
            selectedId={selected?.id ?? null}
            outfit={outfit}
            onEnterSection={enterSection}
            onSelectItem={inspect}
            splatUrl={SPLAT_URL}
          />
        )}
      </div>

      {/* top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-2 p-3 md:p-4">
        <button
          onClick={() => enterSection("map")}
          className="pointer-events-auto rounded-xl bg-white/90 px-3 py-2 text-left shadow-sm backdrop-blur"
        >
          <div className="text-sm font-semibold leading-tight">{catalog?.store_name ?? "Store"}</div>
          <div className="text-[11px] leading-tight text-stone-500">{view === "map" ? "Floor plan" : "← Back to floor plan"}</div>
        </button>
        <form onSubmit={applyOccasion} className="pointer-events-auto order-last flex min-w-0 basis-full items-center gap-1 rounded-xl bg-white/90 p-1 pl-3 shadow-sm backdrop-blur md:order-none md:max-w-md md:flex-1 md:basis-auto">
          <input
            value={occasionInput}
            onChange={(e) => setOccasionInput(e.target.value)}
            placeholder="Where are you going? e.g. summer wedding, under $300"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-stone-400"
            aria-label="Occasion"
          />
          <button className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">Style me</button>
        </form>
        <div className="pointer-events-auto flex rounded-xl bg-white/90 p-1 text-xs shadow-sm backdrop-blur">
          {(["all", "women", "men"] as const).map((g) => (
            <button key={g} onClick={() => setGender(g)} className={`rounded-lg px-2.5 py-1.5 capitalize ${gender === g ? "bg-stone-900 text-white" : "text-stone-600"}`}>
              {g}
            </button>
          ))}
        </div>
        <button onClick={() => setCartOpen(true)} className="pointer-events-auto rounded-xl bg-white/90 px-3 py-2 text-sm font-medium shadow-sm backdrop-blur">
          Bag{cart.length ? ` · ${cart.length}` : ""}
        </button>
        <Link href="/owner" className="pointer-events-auto hidden rounded-xl md:block bg-white/60 px-3 py-2 text-xs text-stone-600 shadow-sm backdrop-blur hover:bg-white/90">
          Owner
        </Link>
      </header>

      {/* section nav */}
      <nav className="absolute bottom-3 left-3 z-20 hidden max-w-[calc(100%-26rem)] flex-wrap gap-1.5 md:flex">
        {[{ id: "map", name: "Floor plan", partner: false }, ...sections].map((s) => (
          <button
            key={s.id}
            onClick={() => enterSection(s.id)}
            className={`rounded-full px-3 py-1.5 text-xs shadow-sm backdrop-blur ${
              view === s.id ? "bg-stone-900 text-white" : "bg-white/85 text-stone-700 hover:bg-white"
            }`}
          >
            {s.name}
            {"subtitle" in s && s.partner ? ` · ${s.subtitle}` : ""}
          </button>
        ))}
      </nav>

      {/* side panel (bottom sheet on mobile) */}
      <aside className="absolute inset-x-0 bottom-0 z-30 max-h-[55dvh] overflow-y-auto rounded-t-2xl border-t border-stone-200 bg-[var(--panel)] p-4 shadow-2xl md:inset-x-auto md:bottom-3 md:right-3 md:top-[4.5rem] md:max-h-none md:w-[380px] md:rounded-2xl md:border">
        {!catalog ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : view === "map" ? (
          <MapIntro sections={sections} onEnter={enterSection} occasion={occasion} />
        ) : view === "fitting" ? (
          <div className="space-y-4">
            <MixMatch
              outfit={outfit}
              catalog={allProducts.filter(visible)}
              gender={gender}
              onChange={(o) => {
                setOutfit(o);
                o.filter((p) => !outfit.some((x) => x.id === p.id)).forEach((p) => api.event({ type: "try_on", shopper_id: shopperId, product_id: p.id }));
              }}
              onStyleMe={() => fetchLooks(outfit)}
              onInspect={(p) => setSelected(p)}
              styling={loadingLooks}
              scoring={catalog.scoring}
            />
            {outfit.length > 0 && (
              <button onClick={() => setPhotoTryOn(outfit)} className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium hover:border-stone-500">
                See this outfit on you (photo)
              </button>
            )}
            {!outfit.length && (
              <p className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
                The mannequin is waiting. Use the arrows to dress it, or pick something from any section and tap “Try on”.
              </p>
            )}
            {selected && view === "fitting" && (
              <ItemDetail product={selected} compact onTryOnMe={() => setPhotoTryOn([selected])} onTryOn={() => tryOn([selected])} onAdd={() => addItem(selected)} onShop={() => shopPartner(selected)} onFeedback={feedback} dislikeFor={dislikeFor} setDislikeFor={setDislikeFor} />
            )}
            {looksForOutfit && <Recommendations res={looksForOutfit} loading={loadingLooks} onTryOn={(l) => tryOn(l.items.map((i) => i.product))} onAddBundle={addLookBundle} onAddItem={addItem} onShopPartner={shopPartner} onInspect={(p) => setSelected(p)} onAddInvBundle={(b) => addBundle(b.title, b.items, b.price_cents, b.list_cents)} onTryOnMe={setPhotoTryOn} />}
          </div>
        ) : selected ? (
          <div className="space-y-4">
            <ItemDetail product={selected} onTryOnMe={() => setPhotoTryOn([selected])} onTryOn={() => tryOn([selected])} onAdd={() => addItem(selected)} onShop={() => shopPartner(selected)} onFeedback={feedback} dislikeFor={dislikeFor} setDislikeFor={setDislikeFor} />
            <Recommendations
              res={looksForSelected}
              loading={loadingLooks}
              onTryOn={(l) => tryOn(l.items.map((i) => i.product))}
              onAddBundle={addLookBundle}
              onAddItem={addItem}
              onShopPartner={shopPartner}
              onInspect={inspect}
              onAddInvBundle={(b) => addBundle(b.title, b.items, b.price_cents, b.list_cents)}
              onTryOnMe={setPhotoTryOn}
            />
          </div>
        ) : current ? (
          <SectionList key={current.id} section={current} onInspect={inspect} />
        ) : null}
      </aside>

      {/* cart */}
      {cartOpen && (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/30" onClick={() => setCartOpen(false)}>
          <div className="h-full w-full max-w-sm overflow-y-auto bg-[var(--panel)] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Your bag</h2>
              <button onClick={() => setCartOpen(false)} className="rounded-md px-2 py-1 text-sm text-stone-500 hover:bg-stone-100">Close</button>
            </div>
            {!cart.length ? (
              <p className="text-sm text-stone-500">Nothing here yet. Bundles from “Complete the look” save you money on in-store pieces.</p>
            ) : (
              <>
                <ul className="space-y-3">
                  {cart.map((l) => (
                    <li key={l.id} className="rounded-xl border border-stone-200 bg-white p-3">
                      {l.kind === "item" ? (
                        <div className="flex items-center gap-2.5">
                          <Swatch product={l.product} size={36} />
                          <div className="min-w-0 flex-1 truncate text-sm">{l.product.title}</div>
                          <span className="text-sm tabular-nums">{usd(l.product.price_cents, l.product.currency)}</span>
                        </div>
                      ) : (
                        <div>
                          <div className="mb-2 flex items-baseline justify-between text-sm">
                            <span className="font-medium text-orange-800">{l.title}</span>
                            <span className="tabular-nums">
                              {usd(l.price_cents, l.items[0]?.currency)} <span className="text-xs text-stone-400 line-through">{usd(l.list_cents, l.items[0]?.currency)}</span>
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {l.items.map((p) => (
                              <Swatch key={p.id} product={p} size={32} />
                            ))}
                          </div>
                        </div>
                      )}
                      <button onClick={() => setCart((c) => c.filter((x) => x.id !== l.id))} className="mt-2 text-[11px] text-stone-500 hover:underline">Remove</button>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-3">
                  <span className="text-sm">Total</span>
                  <span className="text-base font-semibold tabular-nums">{cartTotal}</span>
                </div>
                <button onClick={checkout} className="mt-3 w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white">Checkout (demo)</button>
              </>
            )}
          </div>
        </div>
      )}

      {photoTryOn && <TryOnStudio items={photoTryOn} onClose={() => setPhotoTryOn(null)} />}

      {toast && (
        <div role="status" className="absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-4 py-2 text-xs text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function MapIntro({ sections, onEnter, occasion }: { sections: ReturnType<typeof buildSections>; onEnter: (id: string) => void; occasion: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Welcome in</h1>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">
          Tap a section on the floor plan to walk over. Pick anything to see full outfits built around it, from our racks and from partner stores, then try them on in the fitting room.
        </p>
        {occasion && <p className="mt-2 rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs text-orange-900">Styling for: {occasion}</p>}
      </div>
      <ul className="space-y-1.5">
        {sections.map((s) => (
          <li key={s.id}>
            <button onClick={() => onEnter(s.id)} className="flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-white p-2.5 text-left hover:border-stone-400">
              <span className="h-8 w-8 shrink-0 rounded-lg" style={{ background: s.tint }} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {s.name}
                  {s.partner && <span className="rounded bg-violet-100 px-1 text-[10px] text-violet-700">PARTNER</span>}
                </span>
                <span className="block truncate text-xs text-stone-500">{s.subtitle}</span>
              </span>
              <span className="text-stone-400">›</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-relaxed text-stone-500">
        Partner pieces aren&apos;t sold here. We show them so you can see the whole outfit, and link you to where to buy them.
      </p>
    </div>
  );
}

function SectionList({ section, onInspect }: { section: ReturnType<typeof buildSections>[number]; onInspect: (p: Product) => void }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(24);
  const products = section.products.filter((p) => `${p.title} ${p.brand ?? ""} ${p.color.name} ${p.sizes?.join(" ") ?? ""}`.toLowerCase().includes(query.toLowerCase().trim()));
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{section.name}</h2>
        <p className="text-xs text-stone-500">
          {section.partner ? `${section.subtitle} from partner stores, to complete outfits` : section.subtitle}. Tap an item in the store or below.
        </p>
      </div>
      <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(24); }} aria-label={`Search ${section.name}`} placeholder="Find a piece, color, brand or size" className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500" />
      <p className="text-[11px] text-stone-500">{products.length} pieces · select any item to bring it onto the display</p>
      <ul className="grid grid-cols-1 gap-1.5">
        {products.slice(0, limit).map((product) => (
          <li key={product.id}>
            <button onClick={() => onInspect(product)} className="flex w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-white p-2 text-left hover:border-stone-400">
              <Swatch product={product} size={38} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{product.title}</span>
                <span className="text-[11px] text-stone-500">
                  {usd(product.price_cents, product.currency)}
                  {product.source === "inventory" && (product.quantity ?? 0) <= 3 ? ` · only ${product.quantity} left` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!products.length && <p className="py-4 text-sm text-stone-500">No pieces match that search.</p>}
      {products.length > limit && <button onClick={() => setLimit((n) => n + 24)} className="w-full rounded-xl border border-stone-300 py-2 text-xs font-medium">Show more pieces ({products.length - limit} remaining)</button>}
    </div>
  );
}

function ItemDetail({
  product,
  compact,
  onTryOn,
  onTryOnMe,
  onAdd,
  onShop,
  onFeedback,
  dislikeFor,
  setDislikeFor,
}: {
  product: Product;
  compact?: boolean;
  onTryOn: () => void;
  onTryOnMe: () => void;
  onAdd: () => void;
  onShop: () => void;
  onFeedback: (p: Product, v: "like" | "dislike", reason?: string) => void;
  dislikeFor: string | null;
  setDislikeFor: (id: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-3.5">
      {!compact && <ProductHero product={product} />}
      <div className="flex gap-3">
        {compact && <Swatch product={product} size={48} />}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">{product.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
            <SourceBadge product={product} />
            <span className="font-semibold tabular-nums text-stone-900">{usd(product.price_cents, product.currency)}</span>
            <span>· {product.color.name}</span>
          </div>
          {!compact && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {product.styles.map((s) => (
                <span key={s} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600">{s}</span>
              ))}
            </div>
          )}
          {product.source === "inventory" && product.sizes && !compact && (
            <div className="mt-1.5 text-[11px] text-stone-500">
              Sizes {product.sizes.join(" · ")}
              {(product.quantity ?? 0) <= 3 && <span className="ml-1 font-medium text-orange-700">only {product.quantity} left</span>}
            </div>
          )}
          {product.source === "external" && <div className="mt-1.5 text-[11px] text-stone-500">Not sold here. Shown to complete the outfit.</div>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button onClick={onTryOn} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700">Try on</button>
        <button onClick={onTryOnMe} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50">On me</button>
        {product.source === "inventory" ? (
          <button onClick={onAdd} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50">Add to bag</button>
        ) : (
          <button onClick={onShop} className="rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50">Shop at partner ↗</button>
        )}
        <button onClick={() => onFeedback(product, "like")} className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs hover:bg-stone-50" aria-label="Like">♥</button>
        <button onClick={() => setDislikeFor(dislikeFor === product.id ? null : product.id)} className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs hover:bg-stone-50">Not for me</button>
      </div>
      {dislikeFor === product.id && (
        <div className="mt-3 rounded-xl bg-stone-50 p-2.5">
          <div className="mb-2 text-[11px] text-stone-600">What&apos;s off? We&apos;ll remember.</div>
          <div className="flex flex-wrap gap-1.5">
            {DISLIKE_REASONS.map((r) => (
              <button key={r} onClick={() => onFeedback(product, "dislike", r)} className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] hover:border-stone-400">
                {r}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              onFeedback(product, "dislike", reason || undefined);
              setReason("");
            }}
          >
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="or say it, e.g. not a fan of red" className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs outline-none" />
            <button className="rounded-lg bg-stone-900 px-2.5 text-xs text-white">Send</button>
          </form>
        </div>
      )}
    </section>
  );
}

/** Large product image: real photo when available, else a high-res studio render of the 3D model. */
function ProductHero({ product }: { product: Product }) {
  const shot = useProductShot(product, "hero", 640);
  const credit = product.image_credit;
  return (
    <div className="mb-3">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-white to-stone-100">
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot} alt={product.title} className="h-full w-full object-contain p-2" />
        ) : (
          <Swatch product={product} size={96} />
        )}
      </div>
      {credit ? (
        <PhotoCredit credit={credit} />
      ) : (
        <p className="mt-1.5 text-[10px] leading-relaxed text-stone-500">{product.image_url ? "Product photo" : "Rendered preview"} · {product.model_url ? "3D asset available" : "The rack model is an approximate silhouette, not a scan of this item."}</p>
      )}
    </div>
  );
}

/** Attribution required by the photo's Creative Commons license. */
export function PhotoCredit({ credit }: { credit: NonNullable<Product["image_credit"]> }) {
  return (
    <p className="mt-1 truncate text-[10px] text-stone-400" title={credit.text}>
      Photo
      {credit.creator ? (
        <>
          {" by "}
          {credit.source_url ? (
            <a href={credit.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-600">
              {credit.creator}
            </a>
          ) : (
            credit.creator
          )}
        </>
      ) : (
        credit.source_url && (
          <>
            {" "}
            <a href={credit.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-600">
              source
            </a>
          </>
        )
      )}
      {", "}
      {credit.license_url ? (
        <a href={credit.license_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-600">
          {credit.license}
        </a>
      ) : (
        credit.license
      )}
      {" · representative photo"}
    </p>
  );
}

function Recommendations({
  res,
  loading,
  onTryOn,
  onAddBundle,
  onAddItem,
  onShopPartner,
  onInspect,
  onAddInvBundle,
  onTryOnMe,
}: {
  res: LooksResponse | null;
  loading: boolean;
  onTryOn: (l: Look) => void;
  onAddBundle: (l: Look) => void;
  onAddItem: (p: Product) => void;
  onShopPartner: (p: Product, l: Look) => void;
  onInspect: (p: Product) => void;
  onAddInvBundle: (b: InventoryBundle) => void;
  onTryOnMe: (items: Product[]) => void;
}) {
  if (!res) return <p className="text-xs text-stone-500">{loading ? "Styling outfits…" : ""}</p>;
  const ctx = res.context;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Complete the look</h2>
        {loading && <span className="text-[11px] text-stone-400">updating…</span>}
      </div>
      {ctx.occasion && (
        <p className="text-[11px] text-stone-500">
          For <span className="font-medium text-stone-700">{ctx.occasion}</span>
          {ctx.season ? ` · ${ctx.season}` : ""}
          {ctx.budget_cents ? ` · ${usd(ctx.budget_cents)} USD budget (USDC looks are not converted or budget-checked)` : ""}
          {res.parsed_by === "llm" ? " · read by Claude" : ""}
        </p>
      )}
      {res.looks.map((l) => (
        <LookCard key={l.id} look={l} onTryOnMe={(look) => onTryOnMe(look.items.map((i) => i.product))} onTryOn={onTryOn} onAddBundle={onAddBundle} onAddItem={onAddItem} onShopPartner={onShopPartner} onInspect={onInspect} />
      ))}
      {res.bundles.length > 0 && (
        <div className="space-y-2">
          <h3 className="pt-1 text-sm font-semibold">In-store bundles</h3>
          {res.bundles.map((b) => (
            <div key={b.product_ids.join()} className="rounded-2xl border border-orange-200 bg-orange-50/60 p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-medium text-orange-900">{b.title}</span>
                <span className="text-xs font-semibold text-orange-800">save {b.discount_pct}%</span>
              </div>
              <ul className="mb-2.5 space-y-1">
                {b.items.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-[13px]">
                    <Swatch product={p} size={28} />
                    <button onClick={() => onInspect(p)} className="min-w-0 flex-1 truncate text-left hover:underline">{p.title}</button>
                    <span className="text-[11px] tabular-nums text-stone-500">{usd(p.price_cents, p.currency)}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => onAddInvBundle(b)} className="rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-800">
                Add bundle · {usd(b.price_cents, b.currency)} <span className="text-orange-200 line-through">{usd(b.list_cents, b.currency)}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
