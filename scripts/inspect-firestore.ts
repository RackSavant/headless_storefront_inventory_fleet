/**
 * Read-only Firestore discovery. Prints collection names, doc counts and field names/types only
 * (never field values), so it is safe to share the output.
 *   npm run firestore:inspect -- [collection ...] [--sample 3]
 */
export {};

try {
  process.loadEnvFile(".env");
} catch {
  /* env may already be set */
}

function kind(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array<${v.length ? kind(v[0]) : "?"}>`;
  if (typeof v === "object") {
    const o = v as { toDate?: unknown; latitude?: unknown; path?: unknown };
    if (typeof o.toDate === "function") return "timestamp";
    if (o.latitude !== undefined) return "geopoint";
    if (typeof o.path === "string") return "reference";
    return "map";
  }
  return typeof v;
}

async function main() {
  const args = process.argv.slice(2);
  const si = args.indexOf("--sample");
  const sample = si >= 0 ? Number(args[si + 1]) : 3;
  const di = args.indexOf("--distinct");
  const distinct = di >= 0 ? args[di + 1].split(",") : [];
  const wanted = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--sample" && args[i - 1] !== "--distinct");
  const { getFirestoreDb } = await import("../lib/firebase");
  const db = await getFirestoreDb();
  const cols = wanted.length ? wanted.map((n) => db.collection(n)) : await db.listCollections();
  for (const col of cols) {
    const count = (await col.count().get()).data().count;
    console.log(`\n## ${col.id}  (${count} docs)`);
    const snap = await col.limit(sample).get();
    const fields = new Map<string, Set<string>>();
    for (const d of snap.docs) for (const [k, v] of Object.entries(d.data())) (fields.get(k) ?? fields.set(k, new Set()).get(k)!).add(kind(v));
    for (const [k, t] of fields) console.log(`  ${k}: ${[...t].join("|")}`);
    if (distinct.length) {
      const all = await col.select(...distinct).get();
      for (const f of distinct) {
        const counts = new Map<string, number>();
        for (const d of all.docs) {
          const v = d.get(f);
          const key = typeof v === "string" ? v : JSON.stringify(v);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 40);
        console.log(`  distinct ${f} (${counts.size}): ${top.map(([k, n]) => `${k}=${n}`).join(", ")}`);
      }
    }
    const subs = snap.docs[0] ? await snap.docs[0].ref.listCollections() : [];
    if (subs.length) console.log(`  subcollections (first doc): ${subs.map((s) => s.id).join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
