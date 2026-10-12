/**
 * Tripo image -> 3D (GLB) client for the v3 API (https://developers.tripo3d.ai):
 *   POST {base}/files (multipart "file")                  -> data.file_token
 *   POST {base}/generation/image-to-model {input, model}   -> data.task_id
 *   GET  {base}/tasks/{id}                                 -> data.status, data.output.model_url
 *   GET  {base}/account/balance                            -> returned as-is (shape not documented in what we read)
 * Base defaults to https://openapi.tripo3d.ai/v3 (override with TRIPO_BASE_URL). Errors come back as
 * {code != 0, message, suggestion}, e.g. 2010 "Insufficient credits".
 * Not yet exercised against a live key; the tests use a mocked fetch.
 */
export interface TripoDeps {
  fetch?: typeof fetch;
  apiKey?: string;
  baseUrl?: string;
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_MODEL = "v3.1-20260211";
const DEFAULT_BASE = "https://openapi.tripo3d.ai/v3";

function cfg(d: TripoDeps) {
  const apiKey = d.apiKey ?? process.env.TRIPO_API_KEY;
  if (!apiKey) throw new Error("TRIPO_API_KEY is not set");
  return {
    f: d.fetch ?? fetch,
    apiKey,
    base: (d.baseUrl ?? process.env.TRIPO_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, ""),
    sleep: d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
  };
}

async function json(res: Response, what: string) {
  const body = (await res.json().catch(() => ({}))) as { code?: number; data?: unknown; message?: string; suggestion?: string };
  if (!res.ok || (body.code !== undefined && body.code !== 0)) {
    const hint = [body.message, body.suggestion].filter(Boolean).join(" - ");
    throw new Error(`Tripo ${what} failed: HTTP ${res.status}, code ${body.code ?? "?"}${hint ? `, ${hint}` : ""}`);
  }
  return body.data as Record<string, unknown>;
}

export function mimeFor(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export async function getBalance(deps: TripoDeps = {}): Promise<Record<string, unknown>> {
  const { f, apiKey, base } = cfg(deps);
  return json(await f(`${base}/account/balance`, { headers: { Authorization: `Bearer ${apiKey}` } }), "balance");
}

export async function uploadImage(bytes: Uint8Array, filename: string, deps: TripoDeps = {}): Promise<string> {
  const { f, apiKey, base } = cfg(deps);
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type: mimeFor(filename) }), filename);
  const data = await json(await f(`${base}/files`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form }), "upload");
  if (typeof data.file_token !== "string") throw new Error("Tripo upload returned no file_token");
  return data.file_token;
}

export interface ImageToModelOptions {
  model?: string;
  texture?: boolean;
  pbr?: boolean;
  textureQuality?: "standard" | "detailed";
}

export async function createImageToModelTask(input: string, opts: ImageToModelOptions = {}, deps: TripoDeps = {}): Promise<string> {
  const { f, apiKey, base } = cfg(deps);
  const body = {
    input,
    model: opts.model ?? DEFAULT_MODEL,
    texture: opts.texture ?? true,
    pbr: opts.pbr ?? true,
    texture_quality: opts.textureQuality ?? "standard",
  };
  const data = await json(
    await f(`${base}/generation/image-to-model`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    "create task",
  );
  if (typeof data.task_id !== "string") throw new Error("Tripo returned no task_id");
  return data.task_id;
}

export function extractModelUrl(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  for (const key of ["model_url", "pbr_model", "model", "base_model"]) {
    const v = o[key];
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string") return (v as { url: string }).url;
  }
  return null;
}

export async function waitForModel(taskId: string, opts: { intervalMs?: number; timeoutMs?: number } = {}, deps: TripoDeps = {}): Promise<string> {
  const { f, apiKey, base, sleep } = cfg(deps);
  const interval = opts.intervalMs ?? 3000;
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
  for (;;) {
    const data = await json(await f(`${base}/tasks/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } }), "task query");
    const status = String(data.status ?? "").toLowerCase();
    if (status === "success") {
      const url = extractModelUrl(data.output);
      if (!url) throw new Error("Tripo task succeeded but no model_url was found in output");
      return url;
    }
    if (status === "failed" || status === "cancelled") throw new Error(`Tripo task ${taskId} ended with status ${status}`);
    if (Date.now() > deadline) throw new Error(`Tripo task ${taskId} timed out (last status ${status})`);
    await sleep(interval);
  }
}

export async function downloadModel(url: string, deps: TripoDeps = {}): Promise<Uint8Array> {
  const f = deps.fetch ?? fetch;
  const res = await f(url);
  if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** One photo -> GLB bytes. */
export async function imageToGlb(image: { bytes: Uint8Array; filename: string }, deps: TripoDeps = {}, opts: ImageToModelOptions = {}): Promise<Uint8Array> {
  const token = await uploadImage(image.bytes, image.filename, deps);
  const taskId = await createImageToModelTask(token, opts, deps);
  const url = await waitForModel(taskId, {}, deps);
  return downloadModel(url, deps);
}
