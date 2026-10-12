/**
 * Loads the configured inventory source and prints mapping stats (no image URLs or personal data).
 *   INVENTORY_SOURCE=firestore INVENTORY_FIRESTORE_SHAPE=listings FIRESTORE_INVENTORY_COLLECTION=listings npm run inventory:preview
 */
export {};

try {
  process.loadEnvFile(".env");
} catch {
  /* env may already be set */
}

async function main() {
  const { refreshCatalog, sourceStatus } = await import("../lib/inventory-source");
  const { loadCatalog } = await import("../lib/catalog");
  await refreshCatalog(true);
  const { inventory } = loadCatalog();
  const by = (f: (p: (typeof inventory)[number]) => string) => {
    const m = new Map<string, number>();
    for (const p of inventory) m.set(f(p), (m.get(f(p)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(", ");
  };
  const skipped = new Map<string, number>();
  for (const r of sourceStatus.rejected) skipped.set(r.error.split(";")[0], (skipped.get(r.error.split(";")[0]) ?? 0) + 1);
  console.log(`source: ${sourceStatus.source}${sourceStatus.error ? `  ERROR: ${sourceStatus.error}` : ""}`);
  console.log(`mapped: ${inventory.length}   skipped: ${sourceStatus.rejected.length} (${[...skipped].map(([k, n]) => `${k}=${n}`).join(", ")})`);
  console.log(`by role:    ${by((p) => p.role)}`);
  console.log(`by subtype: ${by((p) => p.subtype)}`);
  console.log(`by gender:  ${by((p) => p.gender)}`);
  console.log(`with image: ${inventory.filter((p) => p.image_url).length}   with model_url: ${inventory.filter((p) => p.model_url).length}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
