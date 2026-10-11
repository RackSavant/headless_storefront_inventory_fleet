/** Prints the looks and in-store bundles for a few anchors. `npm run reco:demo [product-id ...]` */
import { allProducts, getProducts, loadCatalog } from "../lib/catalog";
import { buildInventoryBundles, buildLooks } from "../lib/reco/outfit";

const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["inv_leather-chelsea-boots", "inv_nude-crisscross-stilettos", "inv_performance-running-shoes", "inv_cap-toe-oxfords"];
const { config } = loadCatalog();
const catalog = allProducts();
const usd = (c: number) => `$${(c / 100).toFixed(0)}`;

for (const anchor of getProducts(ids)) {
  console.log(`\n=== ${anchor.title} (${anchor.color.name}, ${anchor.subtype})`);
  const t0 = performance.now();
  const looks = buildLooks({ anchors: [anchor], catalog, config });
  console.log(`  ${(performance.now() - t0).toFixed(0)} ms`);
  for (const look of looks) {
    console.log(`  -- ${look.title} [${look.template}] score ${look.score}`);
    for (const it of look.items)
      console.log(`     ${it.product.source === "inventory" ? "IN STORE" : "partner "} ${it.product.role.padEnd(9)} ${it.product.title}  ${usd(it.product.price_cents)}  · ${it.reasons.join("; ")}`);
    if (look.bundle) console.log(`     bundle: ${look.bundle.label} ${usd(look.bundle.list_cents)} -> ${usd(look.bundle.price_cents)}`);
  }
  for (const b of buildInventoryBundles({ anchors: [anchor], catalog, config }))
    console.log(`  >> ${b.title}: ${b.items.map((p) => p.title).join(" + ")}  ${usd(b.list_cents)} -> ${usd(b.price_cents)} (${b.discount_pct}%)`);
}
