"use client";

/**
 * Custom 3D avatars built from the shopper photos in /public/avatars (avatar-N.jpg).
 * Each photo gives the mannequin a skin tone, a hair colour and a face texture:
 * the head is located with the in-browser pose model, cropped, and feathered.
 */
import { useSyncExternalStore } from "react";
import { detectAnchors, loadImage } from "@/lib/tryon";

export interface AvatarProfile {
  id: number;
  skin: string;
  hair: string;
  /** Feathered face crop with alpha, ready to use as a texture. */
  face: HTMLCanvasElement;
}

const STORAGE_KEY = "avatar_id";
const cache = new Map<number, Promise<AvatarProfile>>();

/** Median colour of a square patch, as a hex string. */
function medianColor(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): string {
  const x = Math.max(0, Math.round(cx - r));
  const y = Math.max(0, Math.round(cy - r));
  const size = Math.max(1, Math.round(r * 2));
  const d = ctx.getImageData(x, y, Math.min(size, ctx.canvas.width - x), Math.min(size, ctx.canvas.height - y)).data;
  const ch: number[][] = [[], [], []];
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) ch[c].push(d[i + c]);
  const med = ch.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
  return "#" + med.map((v) => v.toString(16).padStart(2, "0")).join("");
}

async function analyze(id: number): Promise<AvatarProfile> {
  const img = await loadImage(`/avatars/avatar-${id}.jpg`);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0);

  let nose = { x: w / 2, y: h * 0.14 };
  let shoulder = w * 0.3;
  try {
    const a = await detectAnchors(img, w, h);
    if (a) {
      nose = a.head;
      shoulder = Math.hypot(a.shoulderL.x - a.shoulderR.x, a.shoulderL.y - a.shoulderR.y) || shoulder;
    }
  } catch {
    // keep the framing guess
  }

  // Face box: about half a shoulder-width across, taller than wide, centred just above the nose.
  const fw = Math.min(shoulder * 0.55, w * 0.6);
  const fh = fw * 1.35;
  const fx = nose.x - fw / 2;
  const fy = nose.y - fh * 0.52;

  const face = document.createElement("canvas");
  face.width = 256;
  face.height = Math.round(256 * 1.35);
  const fctx = face.getContext("2d")!;
  fctx.drawImage(src, fx, fy, fw, fh, 0, 0, face.width, face.height);
  // Feather the edges so the crop melts into the skin colour around it.
  fctx.globalCompositeOperation = "destination-in";
  const g = fctx.createRadialGradient(0, 0, face.width * 0.3, 0, 0, face.width * 0.52);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  fctx.save();
  fctx.translate(face.width / 2, face.height / 2);
  fctx.scale(1, face.height / face.width);
  fctx.fillStyle = g;
  fctx.fillRect(-face.width, -face.width, face.width * 2, face.width * 2);
  fctx.restore();

  const skin = medianColor(sctx, nose.x, nose.y + fh * 0.04, fw * 0.07);
  const hair = medianColor(sctx, nose.x, nose.y - fh * 0.62, fw * 0.07);
  return { id, skin, hair, face };
}

export function loadAvatar(id: number): Promise<AvatarProfile> {
  let p = cache.get(id);
  if (!p) {
    p = analyze(id);
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** Avatar numbers that actually have a photo in /public/avatars. */
export async function listAvatars(max = 6): Promise<number[]> {
  const found = await Promise.all(
    Array.from({ length: max }, (_, i) => i + 1).map((n) => fetch(`/avatars/avatar-${n}-thumb.webp`, { method: "HEAD" }).then((r) => (r.ok ? n : 0)).catch(() => 0)),
  );
  return found.filter(Boolean);
}

/* ---------------- active avatar (shared by the 3D store and the try-on) ---------------- */

type Listener = () => void;
const listeners = new Set<Listener>();
let activeId: number | null = null;
let activeProfile: AvatarProfile | null = null;
let restored = false;

function emit() {
  listeners.forEach((l) => l());
}

export function setActiveAvatar(id: number | null) {
  activeId = id;
  if (typeof localStorage !== "undefined") {
    if (id) localStorage.setItem(STORAGE_KEY, String(id));
    else localStorage.removeItem(STORAGE_KEY);
  }
  if (!id) {
    activeProfile = null;
    emit();
    return;
  }
  loadAvatar(id)
    .then((p) => {
      if (activeId === id) {
        activeProfile = p;
        emit();
      }
    })
    .catch(() => {
      if (activeId === id) {
        activeId = null;
        emit();
      }
    });
}

export function getActiveAvatar(): AvatarProfile | null {
  return activeProfile;
}

function subscribe(l: Listener) {
  if (!restored && typeof localStorage !== "undefined") {
    restored = true;
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved) setActiveAvatar(saved);
  }
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useActiveAvatar(): AvatarProfile | null {
  return useSyncExternalStore(subscribe, getActiveAvatar, () => null);
}
