/**
 * Local DWG reader (libredwg compiled to WASM; nothing is uploaded). Prints layers, entity counts per layer,
 * drawing extents, units, block names and text strings so a plan can be mapped into the 3D store.
 *   npm run dwg:inspect -- "/path/to/plan.dwg" [--json out.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Dwg_File_Type, LibreDwg } from "@mlightcad/libredwg-web";

export async function readDwg(file: string) {
  const libredwg = await LibreDwg.create(path.join(process.cwd(), "node_modules", "@mlightcad", "libredwg-web", "wasm") + "/");
  const buf = readFileSync(file);
  const dwg = libredwg.dwg_read_data(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), Dwg_File_Type.DWG);
  if (!dwg) throw new Error("libredwg could not read this DWG");
  const db = libredwg.convert(dwg);
  libredwg.dwg_free(dwg);
  return db;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--json");
  if (!file) throw new Error('usage: npm run dwg:inspect -- "plan.dwg" [--json out.json]');
  const db = await readDwg(file);
  const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : undefined;
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(db));

  const entities = (db as unknown as { entities: Array<Record<string, unknown>> }).entities ?? [];
  const header = (db as unknown as { header?: Record<string, unknown> }).header ?? {};
  console.log(`entities: ${entities.length}`);
  console.log(`units ($INSUNITS): ${String(header.INSUNITS)}   extmin: ${JSON.stringify(header.EXTMIN)}   extmax: ${JSON.stringify(header.EXTMAX)}`);

  const layers = (db as unknown as { tables?: { LAYER?: { entries?: Array<{ name: string }> } } }).tables?.LAYER?.entries ?? [];
  console.log(`layers (${layers.length}): ${layers.map((l) => l.name).join(", ")}`);

  const byType = new Map<string, number>();
  const byLayerType = new Map<string, number>();
  for (const e of entities) {
    byType.set(String(e.type), (byType.get(String(e.type)) ?? 0) + 1);
    const k = `${e.layer}:${e.type}`;
    byLayerType.set(k, (byLayerType.get(k) ?? 0) + 1);
  }
  console.log(`by type: ${[...byType].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(", ")}`);
  console.log("by layer:type");
  for (const [k, n] of [...byLayerType].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`  ${k} = ${n}`);

  const blocks = (db as unknown as { tables?: { BLOCK_RECORD?: { entries?: Array<{ name: string }> } } }).tables?.BLOCK_RECORD?.entries ?? [];
  console.log(`blocks (${blocks.length}): ${blocks.map((b) => b.name).slice(0, 40).join(", ")}`);

  const texts = entities
    .filter((e) => e.type === "TEXT" || e.type === "MTEXT")
    .map((e) => String(e.text ?? e.contents ?? "").replace(/\\P/g, " ").trim())
    .filter(Boolean);
  console.log(`text strings (${texts.length}):`);
  for (const t of [...new Set(texts)].slice(0, 120)) console.log(`  ${t}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
