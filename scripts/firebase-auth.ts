import { readFile } from "node:fs/promises";
import { createSign } from "node:crypto";
import { z } from "zod";

export class FirebaseImportError extends Error {}

export async function authorizeFirebase(credentialPath: string, service: "firestore" | "storage") {
  const account = z.object({ type: z.literal("service_account"), project_id: z.string().min(1), client_email: z.string().email(), private_key: z.string().min(1) }).safeParse(JSON.parse(await readFile(credentialPath, "utf8")));
  if (!account.success) throw new FirebaseImportError("Invalid service-account file; credential values were not printed.");
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const scope = service === "storage" ? "https://www.googleapis.com/auth/devstorage.read_only" : "https://www.googleapis.com/auth/datastore";
  const claim = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.data.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(claim).sign(account.data.private_key, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${claim}.${signature}` }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new FirebaseImportError(`Firebase authentication failed (HTTP ${response.status}). Check the supplied service account.`);
  const token = z.object({ access_token: z.string().min(1) }).safeParse(await response.json());
  if (!token.success) throw new FirebaseImportError("Firebase did not return an access token.");
  return { projectId: account.data.project_id, headers: { Authorization: `Bearer ${token.data.access_token}` } };
}
