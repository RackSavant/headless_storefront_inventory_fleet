import { describe, expect, it } from "vitest";
import { extractModelUrl, imageToGlb, imageType } from "@/lib/tripo";

const ok = (data: unknown) => new Response(JSON.stringify({ code: 0, data }), { status: 200 });

describe("tripo client", () => {
  it("runs upload -> task -> poll -> download in order", async () => {
    const calls: string[] = [];
    let polls = 0;
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url.replace("https://t.test", "")}`);
      if (url.endsWith("/upload/sts")) return ok({ image_token: "tok1" });
      if (url.endsWith("/task") && init?.method === "POST") {
        expect(JSON.parse(init.body as string)).toMatchObject({ type: "image_to_model", file: { type: "png", file_token: "tok1" }, pbr: true });
        return ok({ task_id: "t1" });
      }
      if (url.endsWith("/task/t1")) return ok(++polls < 2 ? { status: "running" } : { status: "success", output: { pbr_model: "https://t.test/m.glb" } });
      if (url === "https://t.test/m.glb") return new Response(new Uint8Array([1, 2, 3]));
      throw new Error("unexpected " + url);
    }) as unknown as typeof fetch;

    const glb = await imageToGlb({ bytes: new Uint8Array([9]), filename: "boot.png" }, { fetch: fake, apiKey: "k", baseUrl: "https://t.test", sleep: async () => {} });
    expect([...glb]).toEqual([1, 2, 3]);
    expect(calls).toEqual(["POST /upload/sts", "POST /task", "GET /task/t1", "GET /task/t1", "GET /m.glb"]);
  });

  it("fails clearly on a failed task and on a missing key", async () => {
    const fake = (async (url: string, init?: RequestInit) => {
      if (url.endsWith("/upload/sts")) return ok({ image_token: "tok1" });
      if (init?.method === "POST") return ok({ task_id: "t2" });
      return ok({ status: "failed" });
    }) as unknown as typeof fetch;
    await expect(imageToGlb({ bytes: new Uint8Array([1]), filename: "a.jpg" }, { fetch: fake, apiKey: "k", baseUrl: "https://t.test", sleep: async () => {} })).rejects.toThrow(/failed/);
    const prev = process.env.TRIPO_API_KEY;
    delete process.env.TRIPO_API_KEY;
    await expect(imageToGlb({ bytes: new Uint8Array([1]), filename: "a.jpg" }, { fetch: fake })).rejects.toThrow(/TRIPO_API_KEY/);
    if (prev) process.env.TRIPO_API_KEY = prev;
  });

  it("extracts model urls from string or object outputs and maps image types", () => {
    expect(extractModelUrl({ model: { url: "u" } })).toBe("u");
    expect(extractModelUrl({ pbr_model: "p", model: "m" })).toBe("p");
    expect(extractModelUrl({})).toBeNull();
    expect(imageType("a.JPEG")).toBe("jpg");
    expect(imageType("a.webp")).toBe("webp");
  });
});
