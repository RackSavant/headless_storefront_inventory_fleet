/**
 * Photoreal try-on with Google's Gemini image model ("Nano Banana"), same
 * Interactions API the spatialintelligence repo uses. Optional: needs
 * GEMINI_API_KEY. The shopper's photo is only sent here when they press the
 * AI button; the 2D try-on runs entirely in the browser.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";

const DataUrl = z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(12_000_000);
const Body = z.object({
  photo: DataUrl,
  items: z
    .array(z.object({ title: z.string().max(120), role: z.string().max(20), image: DataUrl }))
    .min(1)
    .max(6),
});

function split(dataUrl: string) {
  const [head, data] = dataUrl.split(",", 2);
  return { mime_type: head.slice(5, head.indexOf(";")), data };
}

function findImage(node: unknown, seen = new Set<object>()): { data: string; mime: string } | null {
  if (!node || typeof node !== "object" || seen.has(node as object)) return null;
  seen.add(node as object);
  const o = node as Record<string, unknown>;
  const mime = (o.mime_type ?? o.mimeType) as unknown;
  if (typeof o.data === "string" && o.data.length > 100 && typeof mime === "string" && mime.startsWith("image/")) return { data: o.data, mime };
  for (const v of Array.isArray(node) ? node : Object.values(o)) {
    const hit = findImage(v, seen);
    if (hit) return hit;
  }
  return null;
}

export async function GET() {
  return NextResponse.json({ enabled: !!process.env.GEMINI_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "Set GEMINI_API_KEY to enable AI try-on" }, { status: 501 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const { photo, items } = parsed.data;

  const prompt = [
    "Virtual try-on. The first image is a photo of a person. The following images are clothing and accessory products.",
    `Dress the person in exactly these items: ${items.map((i, n) => `image ${n + 2}: ${i.title} (${i.role})`).join("; ")}.`,
    "Keep the person's face, body shape, skin tone, hair, pose, background and lighting unchanged. Replace only the clothing they are wearing where the new items go.",
    "Match each item's color, material and silhouette. Photorealistic result, same framing as the original photo.",
  ].join(" ");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: "text", text: prompt }, { type: "image", ...split(photo) }, ...items.map((i) => ({ type: "image", ...split(i.image) }))],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (/API_KEY_INVALID|API key not valid/i.test(text))
      return NextResponse.json({ error: "Google rejected GEMINI_API_KEY (invalid, revoked or restricted). Replace it with a valid key from Google AI Studio and restart the server." }, { status: 502 });
    if (res.status === 429) return NextResponse.json({ error: "Gemini rate limit or quota reached. Try again in a minute." }, { status: 502 });
    return NextResponse.json({ error: `Gemini ${res.status}: ${text.slice(0, 300)}` }, { status: 502 });
  }
  const json = await res.json();
  const img = findImage((json as Record<string, unknown>).output_image) ?? findImage(json);
  if (!img) return NextResponse.json({ error: "The model returned no image (it may have declined the request)." }, { status: 502 });
  return NextResponse.json({ image: `data:${img.mime};base64,${img.data}` });
}
