/**
 * Copies data/inventory.json into Firestore so the store can run from it.
 *   npm run firestore:seed -- [--dry-run] [--owner <id>]
 * Reads FIREBASE_* and FIRESTORE_INVENTORY_COLLECTION from .env (see .env.example).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

try {
  process.loadEnvFile(".env");
} catch {
  /* env may already be set */
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const ownerIdx = args.indexOf("--owner");
  const owner = ownerIdx >= 0 ? args[ownerIdx + 1] : process.env.FIRESTORE_OWNER_ID;
  const ownerField = process.env.FIRESTORE_OWNER_FIELD || "owner_id";
  const collection = process.env.FIRESTORE_INVENTORY_COLLECTION || "inventory";

  const items = JSON.parse(readFileSync(path.join(process.cwd(), "data", "inventory.json"), "utf8")) as Array<Record<string, unknown> & { id: string }>;
  console.log(`${dry ? "[dry run] " : ""}writing ${items.length} items to "${collection}"${owner ? ` (${ownerField}=${owner})` : ""}`);
  if (dry) return;

  const { getFirestoreDb } = await import("../lib/firebase");
  const db = await getFirestoreDb();
  let batch = db.batch();
  let n = 0;
  for (const item of items) {
    batch.set(db.collection(collection).doc(item.id), { ...item, ...(owner ? { [ownerField]: owner } : {}) }, { merge: true });
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
