/**
 * Read-only Firebase Storage discovery: folder tree, file counts, extensions and total size (no downloads,
 * no signed URLs). Tries FIREBASE_STORAGE_BUCKET, then <project>.firebasestorage.app, then <project>.appspot.com.
 *   npm run storage:inspect -- [prefix] [--depth 2]
 */
export {};

try {
  process.loadEnvFile(".env");
} catch {
  /* env may already be set */
}

async function main() {
  const args = process.argv.slice(2);
  const di = args.indexOf("--depth");
  const maxDepth = di >= 0 ? Number(args[di + 1]) : 2;
  const prefix = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--depth") ?? "";
  const { getFirestoreDb } = await import("../lib/firebase");
  await getFirestoreDb();
  const { getStorage } = await import("firebase-admin/storage");
  const project = process.env.FIREBASE_PROJECT_ID;
  const candidates = [process.env.FIREBASE_STORAGE_BUCKET, `${project}.firebasestorage.app`, `${project}.appspot.com`].filter(Boolean) as string[];
  let bucket = null;
  for (const name of candidates) {
    const b = getStorage().bucket(name);
    try {
      if ((await b.exists())[0]) {
        bucket = b;
        break;
      }
    } catch (e) {
      console.error(`${name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (!bucket) throw new Error(`no bucket found among ${candidates.join(", ")}; set FIREBASE_STORAGE_BUCKET`);
  console.log(`bucket: ${bucket.name}`);

  async function walk(p: string, depth: number) {
    const [files, , apiResp] = await bucket!.getFiles({ prefix: p, delimiter: "/", autoPaginate: false, maxResults: 1000 });
    const prefixes: string[] = (apiResp as { prefixes?: string[] })?.prefixes ?? [];
    const exts = new Map<string, number>();
    let bytes = 0;
    for (const f of files) {
      if (f.name.endsWith("/")) continue;
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "?";
      exts.set(ext, (exts.get(ext) ?? 0) + 1);
      bytes += Number(f.metadata.size ?? 0);
    }
    const indent = "  ".repeat(depth);
    if (files.length || depth === 0) console.log(`${indent}${p || "/"}: ${files.length} files (${[...exts].map(([e, n]) => `${n} .${e}`).join(", ")}) ${(bytes / 1e6).toFixed(1)} MB`);
    for (const sub of prefixes) {
      if (depth < maxDepth) await walk(sub, depth + 1);
      else console.log(`${indent}  ${sub} ...`);
    }
  }
  await walk(prefix, 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
