/**
 * Turns an inventory product photo into a GLB with Tripo and attaches it to the product.
 *   npm run tripo:generate -- --balance
 *   npm run tripo:generate -- <product-id> [--image path/to/photo.jpg] [--quality standard|detailed]
 * Image defaults to the product's image_url under public/. Output: public/models/<product-id>.glb.
 * INVENTORY_SOURCE=firestore also updates the Firestore doc; otherwise data/inventory.json is updated.
 * Needs TRIPO_API_KEY in .env (Tripo v3 API). Each generation spends credits; run --balance first.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getBalance, imageToGlb } from "../lib/tripo";

try {
  process.loadEnvFile(".env");
} catch {
  /* env may already be set */
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--balance")) {
    console.log(JSON.stringify(await getBalance(), null, 2));
    return;
  }
  const id = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--image" && args[args.indexOf(a) - 1] !== "--quality");
  if (!id) throw new Error("usage: npm run tripo:generate -- <product-id> [--image file] [--quality standard|detailed] | --balance");
  const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

  const invPath = path.join(process.cwd(), "data", "inventory.json");
  const items = JSON.parse(readFileSync(invPath, "utf8")) as Array<{ id: string; image_url?: string; model_url?: string }>;
  const item = items.find((p) => p.id === id);
  if (!item && process.env.INVENTORY_SOURCE !== "firestore") throw new Error(`unknown product ${id}`);

  const imageArg = flag("--image");
  const imageRel = imageArg ?? item?.image_url?.replace(/^\//, "");
  if (!imageRel) throw new Error("no image: pass --image or give the product an image_url");
  const imagePath = imageArg ? path.resolve(imageArg) : path.join(process.cwd(), "public", imageRel);

  console.log(`Tripo: ${id} <- ${imagePath}`);
  const glb = await imageToGlb({ bytes: readFileSync(imagePath), filename: path.basename(imagePath) }, {}, { textureQuality: flag("--quality") === "detailed" ? "detailed" : "standard" });

  mkdirSync(path.join(process.cwd(), "public", "models"), { recursive: true });
  const out = path.join(process.cwd(), "public", "models", `${id}.glb`);
  writeFileSync(out, glb);
  const modelUrl = `/models/${id}.glb`;
  console.log(`wrote ${out} (${(glb.length / 1e6).toFixed(2)} MB)`);

  if (item) {
    item.model_url = modelUrl;
    writeFileSync(invPath, JSON.stringify(items, null, 2) + "\n");
    console.log("updated data/inventory.json");
  }
  if (process.env.INVENTORY_SOURCE === "firestore") {
    const { getFirestoreDb } = await import("../lib/firebase");
    const db = await getFirestoreDb();
    await db.collection(process.env.FIRESTORE_INVENTORY_COLLECTION || "inventory").doc(id).set({ model_url: modelUrl }, { merge: true });
    console.log("updated Firestore doc");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
