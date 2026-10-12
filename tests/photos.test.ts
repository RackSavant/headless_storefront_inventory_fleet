import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processPhoto, type BackgroundRemover } from "@/lib/photos";

/** 2400x1800 photo: white wall with a red "garment" rectangle in the middle. */
async function fakePhoto() {
  const garment = await sharp({ create: { width: 800, height: 1000, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();
  return sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#ffffff" } })
    .composite([{ input: garment, gravity: "center" }])
    .jpeg()
    .toBuffer();
}

/** Stub remover: makes near-white pixels transparent. */
const whiteToAlpha: BackgroundRemover = async (png) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) data[i + 3] = 0;
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
};

describe("photo pipeline", () => {
  it("produces a capped original, square thumbnails and a centered transparent cutout", async () => {
    const out = await processPhoto(await fakePhoto(), whiteToAlpha);
    const m = async (b: Buffer) => sharp(b).metadata();

    const full = await m(out.full);
    expect(full.format).toBe("webp");
    expect(Math.max(full.width!, full.height!)).toBeLessThanOrEqual(1600);

    expect([(await m(out.thumb256)).width, (await m(out.thumb256)).height]).toEqual([256, 256]);
    expect([(await m(out.thumb512)).width, (await m(out.thumb512)).height]).toEqual([512, 512]);

    const cut = await m(out.cutout);
    expect([cut.width, cut.height, cut.format, cut.hasAlpha]).toEqual([1024, 1024, "png", true]);
    const { data, info } = await sharp(out.cutout).raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    expect(alphaAt(2, 2)).toBe(0);
    expect(alphaAt(512, 512)).toBe(255);
    expect((await m(out.cutout256)).width).toBe(256);
  });
});
