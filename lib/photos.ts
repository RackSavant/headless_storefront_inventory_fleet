/**
 * Product photo pipeline (server/scripts only): phone photo -> web-sized original, thumbnails, and a
 * cleaned-up transparent cutout. Background removal is injected so tests can stub it.
 */
import sharp from "sharp";

export type BackgroundRemover = (input: Buffer) => Promise<Buffer>;

export interface PhotoSet {
  /** Web-sized original (max 1600px, WebP). */
  full: Buffer;
  thumb256: Buffer;
  thumb512: Buffer;
  /** Transparent PNG, trimmed, centered on a square canvas (max 1024px), lightly touched up. */
  cutout: Buffer;
  cutout256: Buffer;
  width: number;
  height: number;
}

const FULL_MAX = 1600;
const CUTOUT_SIZE = 1024;

export async function imglyRemover(): Promise<BackgroundRemover> {
  const { removeBackground } = await import("@imgly/background-removal-node");
  return async (input) => {
    const blob = await removeBackground(new Blob([new Uint8Array(input)], { type: "image/png" }), { model: "medium", output: { format: "image/png" } });
    return Buffer.from(await blob.arrayBuffer());
  };
}

/** Auto-rotate by EXIF, flatten transparency onto white, cap the longest side. */
async function normalize(input: Buffer) {
  return sharp(input, { failOn: "none" }).rotate().flatten({ background: "#ffffff" }).resize({ width: FULL_MAX, height: FULL_MAX, fit: "inside", withoutEnlargement: true });
}

/** Median-filters the alpha channel (drops 1-4px streaks) and feathers the edge a touch. */
export async function cleanMatte(png: Buffer): Promise<Buffer> {
  const rgb = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = rgb.info;
  const alpha = Buffer.from(await sharp(png).ensureAlpha().extractChannel(3).median(5).raw().toBuffer());

  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height && top < 0; y++) for (let x = 0; x < width; x++) if (alpha[y * width + x] > 128) { top = y; break; }
  for (let y = height - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < width; x++) if (alpha[y * width + x] > 128) { bottom = y; break; }
  if (top >= 0 && bottom > top) {
    const start = Math.round(top + (bottom - top) * 0.7);
    const minRun = Math.round(Math.max(width, height) * 0.02);
    for (let y = start; y <= bottom; y++) {
      let x = 0;
      while (x < width) {
        if (alpha[y * width + x] <= 128) { x++; continue; }
        let end = x;
        while (end < width && alpha[y * width + end] > 128) end++;
        if (end - x < minRun) alpha.fill(0, y * width + x, y * width + end);
        x = end;
      }
    }
  }
  for (let i = 0; i < alpha.length; i++) if (alpha[i] < 40) alpha[i] = 0;

  const f = await sharp(alpha, { raw: { width, height, channels: 1 } }).blur(0.6).raw().toBuffer({ resolveWithObject: true });
  const feathered = f.info.channels === 1 ? f.data : await sharp(f.data, { raw: { width, height, channels: f.info.channels as 3 } }).extractChannel(0).raw().toBuffer();
  return sharp(rgb.data, { raw: { width, height, channels: 3 } })
    .joinChannel(feathered, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

export async function processPhoto(input: Buffer, removeBg: BackgroundRemover): Promise<PhotoSet> {
  const base = await normalize(input);
  const baseBuf = await base.clone().png().toBuffer();
  const meta = await sharp(baseBuf).metadata();

  const touched = sharp(baseBuf).modulate({ brightness: 1.03, saturation: 1.06 }).sharpen({ sigma: 0.7 });
  const full = await touched.clone().webp({ quality: 85 }).toBuffer();
  const thumb256 = await sharp(baseBuf).resize(256, 256, { fit: "cover", position: "attention" }).modulate({ brightness: 1.03, saturation: 1.06 }).webp({ quality: 80 }).toBuffer();
  const thumb512 = await sharp(baseBuf).resize(512, 512, { fit: "cover", position: "attention" }).modulate({ brightness: 1.03, saturation: 1.06 }).webp({ quality: 82 }).toBuffer();

  const cut = await cleanMatte(await removeBg(baseBuf));
  const trimmed = await sharp(cut).trim({ threshold: 1 }).toBuffer();
  const inner = Math.round(CUTOUT_SIZE * 0.92);
  const fitted = await sharp(trimmed)
    .resize({ width: inner, height: inner, fit: "inside", withoutEnlargement: false })
    .modulate({ brightness: 1.03, saturation: 1.06 })
    .sharpen({ sigma: 0.6 })
    .png()
    .toBuffer();
  const cutout = await sharp({ create: { width: CUTOUT_SIZE, height: CUTOUT_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fitted, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  const cutout256 = await sharp(cutout).resize(256, 256).webp({ quality: 85, alphaQuality: 90 }).toBuffer();

  return { full, thumb256, thumb512, cutout, cutout256, width: meta.width ?? 0, height: meta.height ?? 0 };
}
