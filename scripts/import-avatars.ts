import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { args } from "../lib/importing";
import { authorizeFirebase, FirebaseImportError } from "./firebase-auth";

const requested = ["2026-09-09T10-33-29-136Z-person.jpg", "2026-09-04T04-27-36-411Z-person.jpg"];

async function main() {
  const { flags, positional } = args(process.argv.slice(2));
  const credentialPath = positional[0] ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath) throw new FirebaseImportError("Pass the Firebase service-account path.");
  const { projectId, headers } = await authorizeFirebase(credentialPath, "storage");
  const get = async (url: string) => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new FirebaseImportError(`Read-only avatar lookup failed (HTTP ${response.status}). Check Storage access.`);
    return response;
  };
  const buckets = await (await get(`https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(projectId)}&fields=items/name`)).json();
  const found = new Map<string, { bucket: string; name: string; size: string; contentType: string }>();
  for (const bucket of buckets.items ?? []) {
    let pageToken = "";
    do {
      const query = new URLSearchParams({ prefix: "tryon/", maxResults: "1000", fields: "items(name,size,contentType),nextPageToken", ...(pageToken ? { pageToken } : {}) });
      const page = await (await get(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket.name)}/o?${query}`)).json();
      for (const item of page.items ?? []) {
        const filename = item.name.split("/").pop();
        if (requested.includes(filename)) {
          if (found.has(filename)) throw new FirebaseImportError("Multiple matching avatar files found. Specify which Storage object to use.");
          found.set(filename, { ...item, bucket: bucket.name });
        }
      }
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
  }
  console.log(JSON.stringify({ found: requested.map((name) => ({ filename: name, found: found.has(name), size: found.get(name)?.size, contentType: found.get(name)?.contentType })) }, null, 2));
  if (flags.download) {
    if (found.size !== requested.length) throw new FirebaseImportError("Both requested avatar photos must be located before importing.");
    const directory = path.join(process.cwd(), "public", "avatars");
    const images = await Promise.all(requested.map(async (filename) => {
      const item = found.get(filename)!;
      if (!/^image\/jpe?g$/.test(item.contentType) || Number(item.size) > 15_000_000) throw new FirebaseImportError("Avatar is not a supported JPEG or exceeds 15 MB.");
      const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(item.bucket)}/o/${encodeURIComponent(item.name)}?alt=media`;
      const bytes = Buffer.from(await (await get(url)).arrayBuffer());
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new FirebaseImportError("Avatar content is not a JPEG.");
      return bytes;
    }));
    await mkdir(directory, { recursive: true });
    for (let i = 0; i < images.length; i++) await writeFile(path.join(directory, `firebase-model-${i + 1}.jpg`), images[i], { flag: "wx" });
    console.log("Imported the two requested photos to public/avatars. No Firebase objects, permissions, or tokens were modified.");
  }
}

main().catch((error) => {
  console.error(error instanceof FirebaseImportError ? error.message : "Avatar import failed; sensitive error details suppressed. Check local file access and existing avatar files.");
  process.exitCode = 1;
});
