/**
 * Cuts each public/avatars/avatar-N.jpg out of its background and writes avatar-N-cutout.png at the
 * same pixel size, so pose anchors found on the photo line up with the cutout. Local only (gitignored).
 *   npm run avatars:process
 */
export {};

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { cleanMatte, imglyRemover } from "../lib/photos";

async function main() {
  const dir = path.join(process.cwd(), "public", "avatars");
  const removeBg = await imglyRemover();
  for (let n = 1; n <= 9; n++) {
    const src = path.join(dir, `avatar-${n}.jpg`);
    if (!existsSync(src)) continue;
    const input = readFileSync(src);
    const meta = await sharp(input).metadata();
    const cut = await cleanMatte(await removeBg(input));
    const out = await sharp(cut).resize(meta.width, meta.height, { fit: "fill" }).png().toBuffer();
    writeFileSync(path.join(dir, `avatar-${n}-cutout.png`), out);
    console.log(`avatar-${n}: cutout written (${meta.width}x${meta.height})`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
