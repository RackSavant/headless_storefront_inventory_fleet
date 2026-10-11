/**
 * List Openverse photo candidates for a search, to pick one by eye and pin it
 * in data/photo-overrides.json (then `npm run photos:fetch -- --redo <product-id>`).
 *
 *   npm run photos:candidates -- "red combat boots"
 *   npm run photos:candidates -- "red combat boots" --json > candidates.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const CACHE = path.join(process.cwd(), ".data", "openverse-cache.json");
const q = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ");
const asJson = process.argv.includes("--json");
if (!q) {
  console.error('usage: npm run photos:candidates -- "<search>" [--json]');
  process.exit(1);
}

const cache: Record<string, Array<Record<string, unknown>>> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
let results = cache[q];
if (!results) {
  const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm,by,by-sa&page_size=20&mature=false`, {
    headers: { "user-agent": "racksavant-store/0.1 (catalog photos; openverse api)" },
  });
  if (!res.ok) throw new Error(`Openverse ${res.status}`);
  results = ((await res.json()) as { results: Array<Record<string, unknown>> }).results.filter((r) => !r.mature);
  cache[q] = results as never;
  mkdirSync(path.dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache));
}
const rows = results.map((r) => ({ id: r.id, title: String(r.title).slice(0, 80), license: `${r.license} ${r.license_version}`, size: `${r.width}x${r.height}`, url: r.url }));
if (asJson) console.log(JSON.stringify(rows));
else rows.forEach((r, i) => console.log(`${String(i).padStart(2)} ${r.id}  ${r.license.padEnd(10)} ${r.size.padEnd(10)} ${r.title}`));
