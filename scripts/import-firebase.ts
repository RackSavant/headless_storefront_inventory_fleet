import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { authorizeFirebase, FirebaseImportError } from "./firebase-auth";
import { args } from "../lib/importing";
import { decodeFirestore, listingToProduct } from "../lib/firebase-inventory";
import type { Product } from "../lib/types";

async function main() {
  const { flags, positional } = args(process.argv.slice(2));
  const credentialPath = positional[0] ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath) throw new Error("Pass a service-account file path or set GOOGLE_APPLICATION_CREDENTIALS. Add --write to save a local snapshot.");
  const { projectId, headers } = await authorizeFirebase(credentialPath, "firestore");
  const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/listings`;
  const products: Product[] = [];
  const statuses: Record<string, number> = {};
  let pageToken = "";
  let scanned = 0;
  let skippedActive = 0;
  const skippedTitles: string[] = [];
  do {
    const query = new URLSearchParams({ pageSize: "200", ...(pageToken ? { pageToken } : {}) });
    const response = await fetch(`${root}?${query}`, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Firestore read failed (HTTP ${response.status}). No local inventory was changed.`);
    const data = await response.json();
    for (const document of data.documents ?? []) {
      if (++scanned > 10000) throw new Error("Inspection exceeded 10,000 listings. No partial snapshot was saved; narrow the import first.");
      const row = decodeFirestore({ mapValue: { fields: document.fields } }) as Record<string, unknown>;
      const status = typeof row.status === "string" ? row.status : "unknown";
      statuses[status] = (statuses[status] ?? 0) + 1;
      const id = String(document.name).split("/").pop()!;
      const product = listingToProduct(id, row);
      if (product) products.push(product);
      else if (status === "active") {
        skippedActive++;
        if (skippedTitles.length < 12) skippedTitles.push(String(row.title ?? "Untitled").slice(0, 100));
      }
    }
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  console.log(JSON.stringify({ scanned, statuses, imported: products.length, skippedActive, skippedTitles, withPhotos: products.filter((p) => p.image_url).length, withModels: products.filter((p) => p.model_url).length, currencies: [...new Set(products.map((p) => p.currency))] }, null, 2));
  if (flags.write) {
    if (!products.length) throw new Error("No eligible products; refusing to save an empty snapshot.");
    const directory = path.join(process.cwd(), ".data");
    await mkdir(directory, { recursive: true });
    const output = path.join(directory, "firebase-inventory.json");
    await writeFile(output, JSON.stringify(products, null, 2) + "\n", { flag: "wx" });
    console.log("Saved .data/firebase-inventory.json. Firebase was not modified. The snapshot is git-ignored; existing snapshots are never overwritten.");
  }
}

main().catch((error) => {
  console.error(error instanceof FirebaseImportError ? error.message : "Firebase import failed. Check credential access, Firestore permissions, supported listing fields, and whether a local snapshot already exists. Sensitive error details are suppressed.");
  process.exitCode = 1;
});
