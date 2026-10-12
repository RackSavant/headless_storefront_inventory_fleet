/**
 * Tripo image -> 3D (GLB) client, written against the documented v2 OpenAPI:
 *   POST {base}/upload/sts (multipart "file")      -> data.image_token
 *   POST {base}/task {type:"image_to_model", file}  -> data.task_id
 *   GET  {base}/task/{id}                           -> data.status, data.output
 * Base defaults to https://api.tripo3d.ai/v2/openapi (override with TRIPO_BASE_URL).
 * The response shape of the task query is not verified against a live key yet; extractModelUrl
 * accepts string or {url} values for pbr_model / model / base_model.
 */
export interface TripoDeps {
  fetch?: typeof fetch;
  apiKey?: string;
  baseUrl?: string;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BASE = "https://api.tripo3d.ai/v2/openapi";

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
  const body = (await res.json().catch(() => ({}))) as { code?: number; data?: unknown; message?: string };
  if (!res.ok || (body.code !== undefined && body.code !== 0)) {
    throw new Error(`Tripo ${what} failed: HTTP ${res.status} code ${body.code ?? "?"} ${body.message ?? ""}`.trim());
  }
  return body.data as Record<string, unknown>;
}

export function imageType(filename: string): "jpg" | "png" | "webp" {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "png") return "png";
  if (ext === "webp") return "webp";
  return "jpg";
}

export async function uploadImage(bytes: Uint8Array, filename: string, deps: TripoDeps = {}): Promise<string> {
  const { f, apiKey, base } = cfg(deps);
  const type = imageType(filename);
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type: `image/${type === "jpg" ? "jpeg" : type}` }), filename);
  const data = await json(await f(`${base}/upload/sts`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form }), "upload");
  const token = data.image_token;
  if (typeof token !== "string") throw new Error("Tripo upload returned no image_token");
  return token;
}

export async function createImageToModelTask(
  fileToken: string,
  fileType: "jpg" | "png" | "webp",
  opts: { faceLimit?: number; texture?: boolean; pbr?: boolean; modelVersion?: string } = {},
  deps: TripoDeps = {},
): Promise<string> {
  const { f, apiKey, base } = cfg(deps);
  const body: Record<string, unknown> = {
    type: "image_to_model",
    file: { type: fileType, file_token: fileToken },
    texture: opts.texture ?? true,
    pbr: opts.pbr ?? true,
    face_limit: opts.faceLimit ?? 20000,
  };
  if (opts.modelVersion) body.model_version = opts.modelVersion;
  const data = await json(
    await f(`${base}/task`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    "create task",
  );
  if (typeof data.task_id !== "string") throw new Error("Tripo returned no task_id");
  return data.task_id;
}

export function extractModelUrl(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  for (const key of ["pbr_model", "model", "base_model"]) {
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
    const data = await json(await f(`${base}/task/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } }), "task query");
    const status = String(data.status ?? "").toLowerCase();
    if (status === "success") {
      const url = extractModelUrl(data.output);
      if (!url) throw new Error("Tripo task succeeded but no model URL was found in output");
      return url;
    }
    if (["failed", "cancelled", "banned", "expired", "unknown"].includes(status)) throw new Error(`Tripo task ${taskId} ended with status ${status}`);
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

/** Photo(s) -> GLB bytes. Uses the first image only (single-image task). */
export async function imageToGlb(image: { bytes: Uint8Array; filename: string }, deps: TripoDeps = {}, opts: { faceLimit?: number } = {}): Promise<Uint8Array> {
  const token = await uploadImage(image.bytes, image.filename, deps);
  const taskId = await createImageToModelTask(token, imageType(image.filename), opts, deps);
  const url = await waitForModel(taskId, {}, deps);
  return downloadModel(url, deps);
}
