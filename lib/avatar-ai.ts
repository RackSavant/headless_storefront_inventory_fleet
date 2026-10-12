"use client";

/**
 * Photoreal fit for an avatar: the person (on a neutral backdrop) and the garment photos go to
 * /api/tryon, where the image model re-draws the garments conforming to the body (drape, folds,
 * occlusion). The result is cut back out with the avatar's own silhouette so it can stand in the
 * 3D store. Needs GEMINI_API_KEY on the server; resolves to null when it is unavailable.
 */
import type { AvatarProfile } from "@/lib/avatars";
import { loadImage, type TryOnLayer } from "@/lib/tryon";

const BACKDROP = "#e9e4dc";
const GROW_PX = 18;

let enabled: Promise<boolean> | null = null;
const results = new Map<string, HTMLCanvasElement>();

function aiEnabled(): Promise<boolean> {
  enabled ??= fetch("/api/tryon")
    .then((r) => r.json())
    .then((d) => !!d.enabled)
    .catch(() => false);
  return enabled;
}

/** Cutout alpha grown by GROW_PX in every direction, so loose cloth outside the original silhouette survives. */
function grownMask(cutout: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const m = document.createElement("canvas");
  m.width = w;
  m.height = h;
  const g = m.getContext("2d")!;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.drawImage(cutout, Math.cos(a) * GROW_PX, Math.sin(a) * GROW_PX, w, h);
  }
  g.drawImage(cutout, 0, 0, w, h);
  return m;
}

export async function aiAvatarImage(avatar: AvatarProfile, layers: TryOnLayer[]): Promise<HTMLCanvasElement | null> {
  const cutout = avatar.cutout;
  if (!cutout || !layers.length || !(await aiEnabled())) return null;
  const key = `${avatar.id}|${layers.map((l) => l.product.id).sort().join(",")}`;
  const hit = results.get(key);
  if (hit) return hit;

  const w = cutout.naturalWidth;
  const h = cutout.naturalHeight;
  const input = document.createElement("canvas");
  input.width = w;
  input.height = h;
  const ig = input.getContext("2d")!;
  ig.fillStyle = BACKDROP;
  ig.fillRect(0, 0, w, h);
  ig.drawImage(cutout, 0, 0);

  const res = await fetch("/api/tryon", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      photo: input.toDataURL("image/jpeg", 0.9),
      items: layers.map((l) => ({ title: l.product.title, role: l.product.role, image: l.sprite.url })),
    }),
  });
  if (!res.ok) return null;
  const { image } = (await res.json()) as { image?: string };
  if (!image) return null;

  const out = await loadImage(image);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  // Keep the model's framing: stretch only when the aspect ratio already matches, else letterbox.
  const same = Math.abs(out.naturalWidth / out.naturalHeight - w / h) < 0.05;
  if (same) g.drawImage(out, 0, 0, w, h);
  else {
    const k = Math.min(w / out.naturalWidth, h / out.naturalHeight);
    g.drawImage(out, (w - out.naturalWidth * k) / 2, (h - out.naturalHeight * k) / 2, out.naturalWidth * k, out.naturalHeight * k);
  }
  g.globalCompositeOperation = "destination-in";
  g.drawImage(grownMask(cutout, w, h), 0, 0);
  results.set(key, canvas);
  return canvas;
}
