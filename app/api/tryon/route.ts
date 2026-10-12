/**
 * Photoreal try-on with Google's Gemini image model ("Nano Banana") via generateContent:
 * parts are [prompt, person photo, garment product photos] in that order. Optional: needs
 * GEMINI_API_KEY. The shopper's photo is only sent here when they press the AI button;
 * the 2D try-on runs entirely in the browser. With `cutout: true` the result comes back
 * with its background removed (for the standing figure in the 3D store).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";
const endpoint = () => `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const DataUrl = z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(12_000_000);
const Body = z.object({
  photo: DataUrl,
  items: z
    .array(z.object({ title: z.string().max(120), role: z.string().max(20), image: DataUrl }))
    .min(1)
    .max(6),
  cutout: z.boolean().optional(),
});

function split(dataUrl: string) {
  const [head, data] = dataUrl.split(",", 2);
  return { inlineData: { mimeType: head.slice(5, head.indexOf(";")), data } };
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

const COVERAGE_RULES =
  "The subject must remain fully clothed in the output. If the new garments would leave part of the torso or legs uncovered, add a plain, opaque, neutral underlayer (simple base top, shorts or slip). Never make the subject appear more undressed than in the source photo. Nothing sheer that reveals the body.";

const BODY_RULES =
  "Preserve the person's face, hair, body shape, proportions, height, skin tone and age exactly. Do not slim, smooth or retouch the body or face. Keep the same pose, limb positions, camera angle, framing, background and lighting. Only the clothing changes.";

/** Layering order, innermost first, so the model knows what sits over what. */
const LAYER_ORDER = ["bottom", "dress", "top", "outerwear", "shoes", "bag", "accessory"];

function buildPrompt(items: Array<{ title: string; role: string }>) {
  const lines = items.map((i, n) => `  Image ${n + 2} - ${i.role.toUpperCase()}: "${i.title}"`).join("\n");
  const layering = [...items]
    .sort((a, b) => LAYER_ORDER.indexOf(a.role) - LAYER_ORDER.indexOf(b.role))
    .map((i) => `${i.role} (${i.title})`)
    .join(" -> ");
  return `You are a fashion retoucher producing one photorealistic virtual try-on image.

Image 1 is the SUBJECT, a real person who wants to see themselves in different clothes.
Every later image is a product photograph of a garment or accessory:
${lines}

THE PRODUCT PHOTOS ARE THE SOURCE OF TRUTH. Reproduce exactly what they show: colour, print placement, fabric weave and sheen, hardware, stitching, cut and proportions. Titles are only captions; where a caption and its photo disagree, the photo wins. Do not redesign, recolour or "improve" any item. The customer must recognise the product.

TASK: Swap the subject's current clothing for these items, as one believable photograph. The previous garment in the same category must not show through or layer under the new one.
Layering, inside to outside: ${layering}.

COVERAGE: ${COVERAGE_RULES}

BODY: ${BODY_RULES}

REALISM:
- Match fabric drape, weight and wrinkles to how that material really falls on a body in this pose (stiff denim holds shape, silk clings and flows, knits stretch over curves).
- Fit each piece to the subject's actual body: shoulders, waist, hips and leg length. Hems, sleeves and necklines land where they would on this person.
- Keep shadows, contact points and occlusion physically correct where cloth meets skin, hair, hands and other layers. Match the scene's light direction and colour temperature on the garments.
- It must read as a photograph, not a collage: no cut-out edges, halos, floating garments or visible seams.
- Hands, fingers and footwear stay anatomically correct. No added text, logos or watermarks.

OUTPUT: one full-body image with the same framing and aspect ratio as Image 1, high detail, natural skin texture retained.`;
}

export async function GET() {
  return NextResponse.json({ enabled: !!process.env.GEMINI_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "Set GEMINI_API_KEY to enable AI try-on" }, { status: 501 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const { photo, items, cutout } = parsed.data;

  const prompt = buildPrompt(items);

  const res = await fetch(endpoint(), {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, split(photo), ...items.map((i) => split(i.image))] }],
      generationConfig: { temperature: 0.4 },
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
  const img = findImage(json);
  if (!img) return NextResponse.json({ error: "The model returned no image (it may have declined the request)." }, { status: 502 });
  if (cutout) {
    try {
      const { cleanMatte, imglyRemover } = await import("@/lib/photos");
      const removeBg = await imglyRemover();
      const png = await cleanMatte(await removeBg(Buffer.from(img.data, "base64")));
      return NextResponse.json({ image: `data:image/png;base64,${png.toString("base64")}` });
    } catch (e) {
      return NextResponse.json({ error: `Background removal failed: ${e instanceof Error ? e.message : "unknown"}` }, { status: 500 });
    }
  }
  return NextResponse.json({ image: `data:${img.mime};base64,${img.data}` });
}
