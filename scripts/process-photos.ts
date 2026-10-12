/**
 * Downloads each inventory item's first photo, then writes web-sized, thumbnail and cutout versions to
 * public/products/<id>/ (gitignored) plus public/products/manifest.json. Local only: nothing is uploaded
 * and Firestore is not modified.
 *   npm run photos:process -- [--limit 10] [--ids a,b] [--force] [--concurrency 2]
 * Source: whatever INVENTORY_SOURCE selects (see .env). Original photos are fetched over their URLs.
 */
export {};

try {
  process.loadEnvFile(".env");
} catch {
  /* env may already be set */
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface ManifestEntry {
  full: string;
  thumb256: string;
  thumb512: string;
  cutout: string;
  cutout256: string;
  width: number;
  height: number;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const limit = Number(flag("--limit") ?? 10);
  const ids = flag("--ids")?.split(",");
  const force = args.includes("--force");
  const concurrency = Number(flag("--concurrency") ?? 2);

  const { refreshCatalog } = await import("../lib/inventory-source");
  const { loadCatalog } = await import("../lib/catalog");
  const { imglyRemover, processPhoto } = await import("../lib/photos");

  await refreshCatalog(true);
  const items = loadCatalog().inventory.filter((p) => p.image_url && /^https?:/.test(p.image_url) && (!ids || ids.includes(p.id)));

  const root = path.join(process.cwd(), "public", "products");
  mkdirSync(root, { recursive: true });
  const manifestPath = path.join(root, "manifest.json");
  const manifest: Record<string, ManifestEntry> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

  const todo = items.filter((p) => force || !manifest[p.id]).slice(0, ids ? undefined : limit);
  console.log(`${items.length} items with remote photos, ${todo.length} to process`);
  if (!todo.length) return;

  const removeBg = await imglyRemover();
  let done = 0;
  let failed = 0;
  const queue = [...todo];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        const res = await fetch(p.image_url!);
        if (!res.ok) throw new Error(`download HTTP ${res.status}`);
        const out = await processPhoto(Buffer.from(await res.arrayBuffer()), removeBg);
        const dir = path.join(root, p.id);
        mkdirSync(dir, { recursive: true });
        const files = { full: "full.webp", thumb256: "thumb-256.webp", thumb512: "thumb-512.webp", cutout: "cutout.png", cutout256: "cutout-256.webp" } as const;
        const entry = { width: out.width, height: out.height } as ManifestEntry;
        for (const [key, name] of Object.entries(files)) {
          writeFileSync(path.join(dir, name), out[key as keyof typeof files]);
          (entry as unknown as Record<string, string>)[key] = `/products/${p.id}/${name}`;
        }
        manifest[p.id] = entry;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
        console.log(`ok   ${++done + failed}/${todo.length} ${p.id} "${p.title}"`);
      } catch (e) {
        failed++;
        console.log(`FAIL ${done + failed}/${todo.length} ${p.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`done: ${done} ok, ${failed} failed. Output in public/products/`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
