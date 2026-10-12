"use client";

/**
 * 2D photo try-on: find the shopper's body in their photo (MediaPipe pose,
 * in the browser) and draw each garment's cut-out onto it, mapped from the
 * garment's real dimensions in meters to the body's landmarks in pixels.
 */
import type { Sprite } from "@/components/store3d/shots";
import type { Product } from "@/lib/types";

export interface Pt {
  x: number;
  y: number;
}

/** Image-space anchors, using the viewer's left/right (a shopper facing the camera has their right shoulder on image-left). */
export interface Anchors {
  shoulderL: Pt;
  shoulderR: Pt;
  hipL: Pt;
  hipR: Pt;
  ankleL: Pt;
  ankleR: Pt;
  wristL: Pt;
  head: Pt;
}

export const ANCHOR_LABELS: Record<keyof Anchors, string> = {
  shoulderL: "shoulder",
  shoulderR: "shoulder",
  hipL: "hip",
  hipR: "hip",
  ankleL: "ankle",
  ankleR: "ankle",
  wristL: "hand",
  head: "head",
};

/** Reasonable guess for a standing, front-facing, full-length photo. */
export function defaultAnchors(w: number, h: number): Anchors {
  const cx = w / 2;
  return {
    head: { x: cx, y: h * 0.1 },
    shoulderL: { x: cx - w * 0.12, y: h * 0.2 },
    shoulderR: { x: cx + w * 0.12, y: h * 0.2 },
    hipL: { x: cx - w * 0.07, y: h * 0.5 },
    hipR: { x: cx + w * 0.07, y: h * 0.5 },
    ankleL: { x: cx - w * 0.06, y: h * 0.9 },
    ankleR: { x: cx + w * 0.06, y: h * 0.9 },
    wristL: { x: cx - w * 0.17, y: h * 0.5 },
  };
}

/* ---------------- pose detection ---------------- */

const MP_VERSION = "1.1.0";
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

type Landmarker = { detect: (img: HTMLImageElement | HTMLCanvasElement) => { landmarks: Array<Array<{ x: number; y: number; visibility?: number }>> } };
let landmarker: Promise<Landmarker> | null = null;

async function getLandmarker(): Promise<Landmarker> {
  landmarker ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(WASM);
    return (await PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
      runningMode: "IMAGE",
      numPoses: 1,
    })) as unknown as Landmarker;
  })();
  return landmarker;
}

/** Detect the body; returns null when no confident full-body pose is found. */
export async function detectAnchors(img: HTMLImageElement | HTMLCanvasElement, w: number, h: number): Promise<Anchors | null> {
  const lm = await getLandmarker();
  const pose = lm.detect(img).landmarks[0];
  if (!pose) return null;
  const P = (i: number): Pt => ({ x: pose[i].x * w, y: pose[i].y * h });
  // MediaPipe's "left" is the person's left = image right for a front-facing photo.
  const a: Anchors = {
    head: P(0),
    shoulderL: P(12),
    shoulderR: P(11),
    hipL: P(24),
    hipR: P(23),
    ankleL: P(28),
    ankleR: P(27),
    wristL: P(16),
  };
  // Ankles are often cropped out; extrapolate from hip -> knee when they are.
  for (const [ank, knee, hip] of [
    ["ankleL", 26, "hipL"],
    ["ankleR", 25, "hipR"],
  ] as const) {
    const vis = pose[ank === "ankleL" ? 28 : 27].visibility ?? 1;
    if (vis < 0.3 || a[ank].y > h * 1.02) {
      const k = P(knee);
      a[ank] = { x: k.x + (k.x - a[hip].x), y: k.y + (k.y - a[hip].y) };
    }
  }
  return a;
}

/* ---------------- compositing ---------------- */

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function unit(v: Pt, fallback: Pt): Pt {
  const n = Math.hypot(v.x, v.y);
  return n > 1e-3 ? { x: v.x / n, y: v.y / n } : fallback;
}
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Body measurements (meters) the landmarks correspond to. */
const BODY = { shoulderJoints: 0.37, hipJoints: 0.19, torso: 0.5, hipToAnkle: 0.82 };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

/**
 * Draw a sprite so that model point `at` (meters, y up) lands on image point `origin`,
 * with model x along `u` scaled by sx px/m and model -y along the perpendicular scaled by sy px/m.
 */
let light = 1;

/** Average brightness of the photo (0..1) mapped to a garment brightness multiplier. */
function lightingFor(photo: HTMLImageElement): number {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const g = c.getContext("2d")!;
  g.drawImage(photo, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  const lum = sum / 256;
  return Math.min(1.08, Math.max(0.82, 0.75 + lum * 0.5));
}

function drawMapped(ctx: CanvasRenderingContext2D, img: HTMLImageElement, sp: Sprite, origin: Pt, u: Pt, sx: number, sy: number, at = { x: 0, y: 0 }, form = false) {
  const v = { x: -u.y, y: u.x }; // image "down" perpendicular to u
  // sprite px -> model meters (x right, y up)
  const m = (2 * sp.half) / sp.size;
  const S = new DOMMatrix([m, 0, 0, -m, sp.center.x - sp.half, sp.center.y + sp.half]);
  // model meters -> image px
  const M = new DOMMatrix([u.x * sx, u.y * sx, -v.x * sy, -v.y * sy, origin.x - (u.x * sx * at.x - v.x * sy * at.y), origin.y - (u.y * sx * at.x - v.y * sy * at.y)]);
  const T = M.multiply(S);
  const px = Math.hypot(T.a, T.b) * (sp.size / 100);

  // 1. The garment alone on a scratch canvas, so shading only lands on cloth pixels.
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const tmp = document.createElement("canvas");
  tmp.width = W;
  tmp.height = H;
  const t = tmp.getContext("2d", { willReadFrequently: true })!;
  t.setTransform(T);
  t.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, sp.size, sp.size);
  t.setTransform(1, 0, 0, 1, 0, 0);

  // 2. Form shading: darker toward the silhouette edges, a soft highlight down the middle, heavier at the hem.
  if (form) {
    const d = t.getImageData(0, 0, W, H).data;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (let y = 0; y < H; y += 3)
      for (let x = 0; x < W; x += 3)
        if (d[(y * W + x) * 4 + 3] > 40) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 > x0 && y1 > y0) {
      t.globalCompositeOperation = "source-atop";
      const gx = t.createLinearGradient(x0, 0, x1, 0);
      gx.addColorStop(0, "rgba(0,0,0,0.34)");
      gx.addColorStop(0.16, "rgba(0,0,0,0.08)");
      gx.addColorStop(0.42, "rgba(255,255,255,0.07)");
      gx.addColorStop(0.58, "rgba(255,255,255,0.03)");
      gx.addColorStop(0.84, "rgba(0,0,0,0.12)");
      gx.addColorStop(1, "rgba(0,0,0,0.38)");
      t.fillStyle = gx;
      t.fillRect(x0, y0, x1 - x0, y1 - y0);
      const gy = t.createLinearGradient(0, y0, 0, y1);
      gy.addColorStop(0, "rgba(0,0,0,0.10)");
      gy.addColorStop(0.12, "rgba(0,0,0,0)");
      gy.addColorStop(0.86, "rgba(0,0,0,0)");
      gy.addColorStop(1, "rgba(0,0,0,0.22)");
      t.fillStyle = gy;
      t.fillRect(x0, y0, x1 - x0, y1 - y0);
      t.globalCompositeOperation = "source-over";
    }
  }

  // 3. Soft ambient shadow, then a tight contact shadow where cloth meets the body.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = `brightness(${light * 0.9}) blur(0.4px)`;
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 5;
  ctx.drawImage(tmp, 0, 0);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = Math.max(1, px * 0.4);
  ctx.shadowOffsetY = 1;
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

export interface TryOnLayer {
  product: Product;
  sprite: Sprite;
}

const ORDER: Product["role"][] = ["bottom", "shoes", "dress", "top", "outerwear", "bag", "accessory"];

export async function composeTryOn(canvas: HTMLCanvasElement, photo: HTMLImageElement, a: Anchors, layers: TryOnLayer[], base?: HTMLImageElement) {
  const ctx = canvas.getContext("2d")!;
  canvas.width = photo.naturalWidth;
  canvas.height = photo.naturalHeight;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base ?? photo, 0, 0);
  light = lightingFor(photo);

  const sh = dist(a.shoulderL, a.shoulderR) || 1;
  const hipMid = mid(a.hipL, a.hipR);
  const shMid = mid(a.shoulderL, a.shoulderR);
  const ankleMid = mid(a.ankleL, a.ankleR);
  // Orientation comes from the body itself (shoulders -> hips is "down"), not from which
  // landmark is labeled left: pose models swap left/right on back views and mirrored selfies.
  const down = unit({ x: hipMid.x - shMid.x, y: hipMid.y - shMid.y }, { x: 0, y: 1 });
  // drawMapped treats (-u.y, u.x) as "down", so u is "down" rotated a quarter turn back: image-right.
  const u = { x: down.y, y: -down.x };
  const pxPerM = sh / BODY.shoulderJoints;
  const torsoPx = dist(shMid, hipMid);
  const legPx = dist(hipMid, ankleMid);
  const sorted = [...layers].sort((x, y) => ORDER.indexOf(x.product.role) - ORDER.indexOf(y.product.role));

  for (const { product: p, sprite } of sorted) {
    const img = await loadImage(sprite.url);
    if (p.role === "top" || p.role === "outerwear" || p.role === "dress") {
      // Garment y=0 is the shoulder seam, which sits ~3 cm above the shoulder joints.
      const sy = Math.min(1.4 * pxPerM, Math.max(0.7 * pxPerM, torsoPx / BODY.torso));
      const origin = { x: shMid.x - (-u.y) * 0.03 * sy, y: shMid.y - u.x * 0.03 * sy };
      drawMapped(ctx, img, sprite, origin, u, pxPerM * 1.05, sy, undefined, true);
    } else if (p.role === "bottom") {
      // Waistband (y=0) sits ~8 cm above the hip joints.
      const legDown = unit({ x: ankleMid.x - hipMid.x, y: ankleMid.y - hipMid.y }, down);
      const hipU = { x: legDown.y, y: -legDown.x };
      const sx = Math.max(pxPerM * 0.9, dist(a.hipL, a.hipR) / BODY.hipJoints) * 0.95;
      const sy = Math.max(0.6 * pxPerM, legPx / (BODY.hipToAnkle + 0.1));
      const origin = { x: hipMid.x - (-hipU.y) * 0.08 * sy, y: hipMid.y - hipU.x * 0.08 * sy };
      drawMapped(ctx, img, sprite, origin, hipU, sx, sy, undefined, true);
    } else if (p.role === "shoes") {
      for (const ank of [a.ankleL, a.ankleR]) {
        // shoe sprite is the front view; its top-of-collar sits at the ankle
        const at = { x: sprite.center.x, y: sprite.center.y + sprite.half * 0.55 };
        drawMapped(ctx, img, sprite, { x: ank.x, y: ank.y + 0.02 * pxPerM }, { x: 1, y: 0 }, pxPerM, pxPerM, at);
      }
    } else if (p.role === "bag") {
      const at = { x: sprite.center.x, y: sprite.center.y + sprite.half * 0.6 };
      drawMapped(ctx, img, sprite, a.wristL, { x: 1, y: 0 }, pxPerM * 0.9, pxPerM * 0.9, at);
    } else if (p.role === "accessory") {
      if (p.subtype === "belt") {
        // A belt is hidden under a jacket or skipped with a dress, same as on the 3D mannequin.
        if (layers.some((l) => l.product.role === "outerwear" || l.product.role === "dress")) continue;
        // a flat strap across the waist reads better than the coiled product shot
        const w = dist(a.hipL, a.hipR) * 2.1;
        ctx.save();
        ctx.translate(hipMid.x, hipMid.y - 0.1 * pxPerM);
        ctx.rotate(Math.atan2(u.y, u.x));
        ctx.fillStyle = p.color.hex;
        ctx.fillRect(-w / 2, -0.018 * pxPerM, w, 0.036 * pxPerM);
        ctx.fillStyle = "#c9b27c";
        ctx.fillRect(-0.02 * pxPerM, -0.022 * pxPerM, 0.04 * pxPerM, 0.044 * pxPerM);
        ctx.restore();
      } else if (/cap|beanie|sun-hat/.test(p.subtype)) {
        const at = { x: sprite.center.x, y: sprite.center.y - sprite.half * 0.2 };
        drawMapped(ctx, img, sprite, { x: a.head.x, y: a.head.y - 0.1 * pxPerM }, u, pxPerM * 1.05, pxPerM * 1.05, at);
      } else if (p.subtype === "scarf" || p.subtype === "necklace") {
        drawMapped(ctx, img, sprite, { x: shMid.x, y: shMid.y + 0.02 * pxPerM }, u, pxPerM * 0.8, pxPerM * 0.8, sprite.center);
      }
    }
  }
}

export async function downscale(file: Blob, max = 1280): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export { loadImage };
