"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { frontSprite, modelPhoto } from "@/components/store3d/shots";
import Swatch from "@/components/ui/Swatch";
import { ANCHOR_LABELS, composeTryOn, defaultAnchors, detectAnchors, downscale, loadImage, productPhotoData, type Anchors, type TryOnLayer } from "@/lib/tryon";
import { prepareTryOnReferences } from "@/lib/tryon-reference";
import type { Product } from "@/lib/types";

type Status = "idle" | "detecting" | "ready" | "no-pose" | "error";

export default function TryOnStudio({ items, onClose }: { items: Product[]; onClose: () => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [anchors, setAnchors] = useState<Anchors | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [layers, setLayers] = useState<TryOnLayer[]>([]);
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [ai, setAi] = useState<{ enabled: boolean; loading: boolean; image: string | null; error: string | null }>({ enabled: false, loading: false, image: null, error: null });
  const [showPoints, setShowPoints] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<keyof Anchors | null>(null);
  const aiRequest = useRef<AbortController | null>(null);
  const [referenceWarning, setReferenceWarning] = useState<string | null>(null);

  useEffect(() => {
    aiRequest.current?.abort();
    setAi((s) => ({ ...s, image: null, error: null, loading: false }));
    setReferenceWarning(null);
    return () => aiRequest.current?.abort();
  }, [photo, items]);

  useEffect(() => {
    fetch("/api/tryon")
      .then((r) => r.json())
      .then((d) => setAi((s) => ({ ...s, enabled: !!d.enabled })))
      .catch(() => {});
  }, []);

  // Garment cut-outs for this outfit.
  useEffect(() => {
    let alive = true;
    setLayers([]);
    Promise.all(items.map(async (p) => ({ product: p, sprite: await frontSprite(p) })))
      .then((l) => alive && setLayers(l))
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [items]);

  // New photo: load, then find the body.
  useEffect(() => {
    if (!photo) return;
    let alive = true;
    setImg(null);
    setAnchors(null);
    setStatus("detecting");
    (async () => {
      const im = await loadImage(photo);
      if (!alive) return;
      setImg(im);
      setAi((s) => ({ ...s, image: null, error: null }));
      setStatus("detecting");
      try {
        const found = await detectAnchors(im, im.naturalWidth, im.naturalHeight);
        if (!alive) return;
        setAnchors(found ?? defaultAnchors(im.naturalWidth, im.naturalHeight));
        setStatus(found ? "ready" : "no-pose");
        if (!found) setShowPoints(true);
      } catch {
        if (!alive) return;
        setAnchors(defaultAnchors(im.naturalWidth, im.naturalHeight));
        setStatus("no-pose");
        setShowPoints(true);
      }
    })().catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [photo]);

  // Re-composite whenever the body points or garments change.
  useEffect(() => {
    if (!img || !anchors || !canvas.current) return;
    const controller = new AbortController();
    const target = canvas.current;
    const id = requestAnimationFrame(() => {
      composeTryOn(target, img, anchors, layers, controller.signal).catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    });
    return () => {
      controller.abort();
      cancelAnimationFrame(id);
    };
  }, [img, anchors, layers, ai.image, camera]);

  useEffect(() => () => camera?.getTracks().forEach((t) => t.stop()), [camera]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPhoto(await downscale(f));
    } catch {
      setStatus("error");
    }
  };

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 1280, height: 960 } });
      setCamera(s);
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = s;
          video.current.play();
        }
      });
    } catch {
      setStatus("error");
    }
  };

  const snap = () => {
    const v = video.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    camera?.getTracks().forEach((t) => t.stop());
    setCamera(null);
    setPhoto(c.toDataURL("image/jpeg", 0.9));
  };

  const pointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current || !stage.current || !img || !anchors) return;
      const r = stage.current.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * img.naturalWidth;
      const y = ((e.clientY - r.top) / r.height) * img.naturalHeight;
      setAnchors({ ...anchors, [drag.current]: { x, y } });
    },
    [img, anchors],
  );

  const runAi = async () => {
    if (!photo || ai.loading) return;
    aiRequest.current?.abort();
    const controller = new AbortController();
    aiRequest.current = controller;
    setAi((s) => ({ ...s, loading: true, error: null }));
    try {
      const references = await prepareTryOnReferences(items, productPhotoData, async (p) => (await frontSprite(p)).url);
      if (controller.signal.aborted) return;
      setReferenceWarning(references.some((r) => r.reference === "approximation") ? "Some items have no verified product photo. Their appearance is approximate." : null);
      const res = await fetch("/api/tryon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photo, items: references }),
        signal: controller.signal,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Try-on failed");
      if (!controller.signal.aborted) setAi((s) => ({ ...s, loading: false, image: d.image }));
    } catch (e) {
      if (!controller.signal.aborted) setAi((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Try-on failed" }));
    }
  };

  const download = () => {
    const url = ai.image ?? canvas.current?.toDataURL("image/jpeg", 0.92);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "try-on.jpg";
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-0 md:p-6" onClick={onClose}>
      <div className="flex w-full max-w-5xl flex-col overflow-hidden bg-[var(--panel)] md:flex-row md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {/* stage */}
        <div className="relative flex min-h-[50dvh] flex-1 items-center justify-center bg-stone-900">
          {camera ? (
            <div className="flex flex-col items-center gap-3 p-4">
              <video ref={video} playsInline muted className="max-h-[60dvh] rounded-lg" />
              <button onClick={snap} className="rounded-full bg-white px-5 py-2 text-sm font-medium">
                Take photo
              </button>
            </div>
          ) : !photo ? (
            <div className="max-w-xs p-6 text-center text-sm text-stone-300">
              Stand facing the camera, full length if you can, arms slightly away from your body. Plain backgrounds work best.
            </div>
          ) : ai.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ai.image} alt="AI try-on result" className="max-h-[85dvh] max-w-full object-contain" />
          ) : (
            <div
              ref={stage}
              className="relative inline-block max-h-[85dvh] touch-none"
              onPointerMove={pointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerLeave={() => (drag.current = null)}
            >
              <canvas ref={canvas} className="block max-h-[85dvh] max-w-full" />
              {showPoints &&
                anchors &&
                img &&
                (Object.keys(anchors) as Array<keyof Anchors>).map((k) => (
                  <button
                    key={k}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      drag.current = k;
                    }}
                    className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-orange-600 shadow"
                    style={{ left: `${(anchors[k].x / img.naturalWidth) * 100}%`, top: `${(anchors[k].y / img.naturalHeight) * 100}%` }}
                    title={`Drag to your ${ANCHOR_LABELS[k]}`}
                    aria-label={`Move ${ANCHOR_LABELS[k]} point`}
                  />
                ))}
            </div>
          )}
          {status === "detecting" && <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs">Finding your pose…</div>}
        </div>

        {/* controls */}
        <aside className="w-full space-y-4 overflow-y-auto p-4 md:w-80">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold">Try it on you</h2>
              <p className="text-xs text-stone-500">Your photo stays in this browser{ai.enabled ? " unless you use AI try-on" : ""}.</p>
              <p className="mt-1 text-xs text-stone-500">The 2D preview uses approximate garment shapes. It does not predict size or physical fit.</p>
            </div>
            <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-stone-500 hover:bg-stone-100">
              Close
            </button>
          </div>

          <div className="flex gap-2">
            <label className="flex-1 cursor-pointer rounded-lg bg-stone-900 px-3 py-2 text-center text-xs font-medium text-white">
              Upload photo
              <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <button onClick={startCamera} className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium">
              Use camera
            </button>
          </div>
          <button onClick={async () => setPhoto(await modelPhoto())} className="w-full text-xs text-stone-500 hover:underline">
            No photo? Try it on a model
          </button>

          {status === "no-pose" && (
            <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">Couldn&apos;t find a full body. Drag the orange points onto your shoulders, hips, ankles, hand and head.</p>
          )}
          {status === "error" && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800">Something went wrong (camera blocked or image unreadable).</p>}

          <div>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">Wearing</h3>
            <ul className="space-y-1.5">
              {items.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-[13px]">
                  <Swatch product={p} size={34} />
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                </li>
              ))}
            </ul>
          </div>

          {photo && !ai.image && (
            <label className="flex items-center gap-2 text-xs text-stone-600">
              <input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} />
              Adjust body points
            </label>
          )}

          <div className="space-y-2 border-t border-stone-200 pt-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">Photoreal (AI)</h3>
            {ai.enabled ? (
              <>
                <p className="text-xs text-stone-600">Uses actual product photos when available. Clicking below sends your photo and item references to Google&apos;s Gemini image model. This is a style visualization, not a size or fit guarantee.</p>
                {referenceWarning && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{referenceWarning}</p>}
                <button onClick={runAi} disabled={!photo || ai.loading || !items.length || items.length > 6} className="w-full rounded-lg border border-violet-300 px-3 py-2 text-xs font-medium text-violet-800 disabled:opacity-40">
                  {ai.loading ? "Rendering (up to a minute)…" : ai.image ? "Render again" : "Make it photoreal"}
                </button>
                {ai.image && (
                  <button onClick={() => setAi((s) => ({ ...s, image: null }))} className="w-full text-xs text-stone-500 hover:underline">
                    Back to the 2D try-on
                  </button>
                )}
                {ai.error && <p className="text-xs text-red-700">{ai.error}</p>}
              </>
            ) : (
              <p className="text-xs text-stone-500">Set GEMINI_API_KEY on the server to add a photoreal version.</p>
            )}
          </div>

          <button onClick={download} disabled={!photo} className="w-full rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
            Download image
          </button>
        </aside>
      </div>
    </div>
  );
}
