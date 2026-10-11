/**
 * Optional Claude layer. Every function returns null when there are no Claude
 * credentials (API key or `ant auth login` OAuth profile) or the call fails, and callers fall back to the deterministic engine —
 * recommendations themselves never depend on the model.
 */
import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { SEASONS, STYLES, type Look, type ShopperContext } from "@/lib/types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/**
 * Claude credentials, in the SDK's own resolution order: ANTHROPIC_API_KEY,
 * ANTHROPIC_AUTH_TOKEN, or an OAuth profile from `ant auth login` (stored under
 * ~/.config/anthropic/credentials/). A bare `new Anthropic()` picks up whichever
 * exists, so OAuth sessions work with no API key at all.
 */
export function claudeAuthSource(): "api_key" | "auth_token" | "oauth_profile" | null {
  if (process.env.ANTHROPIC_API_KEY) return "api_key";
  if (process.env.ANTHROPIC_AUTH_TOKEN) return "auth_token";
  const dir =
    process.env.ANTHROPIC_CONFIG_DIR ||
    (process.platform === "win32" ? path.join(process.env.APPDATA ?? "", "Anthropic") : path.join(os.homedir(), ".config", "anthropic"));
  try {
    const creds = readdirSync(path.join(dir, "credentials")).filter((f) => f.endsWith(".json"));
    if (creds.length) return "oauth_profile";
  } catch {
    // no profile directory
  }
  return null;
}

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!claudeAuthSource()) return null;
  client ??= new Anthropic();
  return client;
}

export const llmEnabled = () => claudeAuthSource() !== null;

const OccasionSchema = z.object({
  occasion: z.string().describe("Short label, e.g. 'Beach wedding' or 'First date'"),
  formality: z.number().int().min(1).max(5).describe("1 gym/lounge, 2 casual, 3 smart casual, 4 business/cocktail, 5 black tie"),
  season: z.enum(SEASONS).nullable(),
  styles: z.array(z.enum(STYLES)).max(3),
  budget_usd: z.number().nullable(),
  gender: z.enum(["women", "men", "unisex"]).nullable(),
});

async function parse<T extends z.ZodType>(schema: T, system: string, user: string): Promise<z.infer<T> | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const res = await c.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 2000,
        // Shopper is waiting on a click; this is a small extraction task.
        output_config: { effort: "low", format: betaZodOutputFormat(schema) },
        // On a safety decline, let the API re-run the request on its recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content: user }],
      },
      { timeout: 15_000 },
    );
    if (res.stop_reason === "refusal") return null;
    return res.parsed_output ?? null;
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.warn(`[llm] ${err.status ?? ""} ${err.message}`);
    else console.warn("[llm]", err);
    return null;
  }
}

export async function llmParseOccasion(text: string): Promise<ShopperContext | null> {
  const out = await parse(
    OccasionSchema,
    "You turn a shopper's description of where they're going into outfit constraints for a clothing store's recommender. Infer season only when the text implies one.",
    text,
  );
  if (!out) return null;
  return {
    occasion: out.occasion,
    formality: out.formality,
    season: out.season ?? undefined,
    styles: out.styles.length ? out.styles : undefined,
    budget_cents: out.budget_usd ? Math.round(out.budget_usd * 100) : undefined,
    gender: out.gender ?? undefined,
  };
}

const BlurbSchema = z.object({ blurbs: z.array(z.string()) });

/** Rewrites each look's template blurb as a two-sentence stylist note. Same order as input. */
export async function llmLookBlurbs(looks: Look[], ctx: ShopperContext): Promise<string[] | null> {
  if (!looks.length) return null;
  const brief = looks.map((l, i) => ({
    look: i + 1,
    title: l.title,
    items: l.items.map((it) => `${it.product.title} (${it.product.color.name}, ${it.product.role}${it.product.source === "inventory" ? ", in store" : ""})`),
  }));
  const out = await parse(
    BlurbSchema,
    "You are a store stylist. For each look, write exactly two short sentences a shopper reads under the outfit: why the pieces work together, and one way to wear it. No prices, no hype words, no emojis. Return one string per look, in order.",
    `Occasion: ${ctx.occasion ?? "unspecified"}\n${JSON.stringify(brief)}`,
  );
  return out && out.blurbs.length === looks.length ? out.blurbs : null;
}
