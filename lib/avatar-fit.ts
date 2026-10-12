"use client";

/**
 * Photoreal fit for an avatar, the same way the shared RackSavant try-on works: the person's photo
 * and the garments' real product photos go to /api/tryon, where the image model redraws the person
 * wearing them (drape, folds, occlusion). The server returns it with the background removed, at the
 * model's own aspect ratio, so it is never stretched. Needs GEMINI_API_KEY; resolves to null when
 * the model is unavailable or no garment has a photo.
 */
import { alphaBounds, type AvatarProfile } from "@/lib/avatars";
import { loadImage } from "@/lib/tryon";
import type { Product } from "@/lib/types";

export interface AvatarFit {
  image: HTMLImageElement;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

let enabled: Promise<boolean> | null = null;
const results = new Map<string, AvatarFit>();
const pending = new Map<string, Promise<AvatarFit | null>>();
const COOLDOWN_MS = 60_000;
let failedAt = 0;

export function aiAvailable(): Promise<boolean> {
  enabled ??= fetch("/api/tryon")
    .then((r) => r.json())
    .then((d) => !!d.enabled)
    .catch(() => false);
  return enabled;
}

function toDataUrl(img: HTMLImageElement, max: number, type: "image/jpeg" | "image/png"): string {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext("2d")!;
  if (type === "image/jpeg") {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, c.width, c.height);
  }
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.9);
}

async function productPhoto(p: Product): Promise<string | null> {
  if (!p.image_url) return null;
  try {
    return toDataUrl(await loadImage(p.image_url), 1024, "image/jpeg");
  } catch {
    return null;
  }
}

async function request(avatar: AvatarProfile, items: Product[]): Promise<AvatarFit | null> {
  const photos = await Promise.all(items.map(productPhoto));
  const usable = items.map((p, i) => ({ p, image: photos[i] })).filter((x): x is { p: Product; image: string } => !!x.image);
  if (!usable.length) return null;

  const res = await fetch("/api/tryon", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      photo: toDataUrl(avatar.photo, 1024, "image/jpeg"),
      items: usable.map(({ p, image }) => ({ title: p.title.slice(0, 120), role: p.role, image })),
      cutout: true,
    }),
  });
  if (!res.ok) {
    failedAt = Date.now();
    return null;
  }
  const { image } = (await res.json()) as { image?: string };
  if (!image) return null;
  const img = await loadImage(image);
  return { image: img, bbox: alphaBounds(img) };
}

export async function aiAvatarFit(avatar: AvatarProfile, items: Product[]): Promise<AvatarFit | null> {
  if (!items.length || !(await aiAvailable())) return null;
  const key = `${avatar.id}|${items.map((p) => p.id).sort().join(",")}`;
  const hit = results.get(key);
  if (hit) return hit;
  const running = pending.get(key);
  if (running) return running;
  if (Date.now() - failedAt < COOLDOWN_MS || pending.size > 0) return null;
  const job = request(avatar, items)
    .then((fit) => {
      if (fit) results.set(key, fit);
      else failedAt = Date.now();
      return fit;
    })
    .catch(() => {
      failedAt = Date.now();
      return null;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
