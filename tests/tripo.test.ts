import { describe, expect, it } from "vitest";
import { createImageToModelTask, extractModelUrl, getBalance, imageToGlb, mimeFor } from "@/lib/tripo";

const ok = (data: unknown) => new Response(JSON.stringify({ code: 0, data }), { status: 200 });
const deps = (fake: unknown) => ({ fetch: fake as typeof fetch, apiKey: "k", baseUrl: "https://t.test/v3", sleep: async () => {} });

describe("tripo v3 client", () => {
  it("runs upload -> task -> poll -> download in order", async () => {
    const calls: string[] = [];
    let polls = 0;
    const fake = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url.replace("https://t.test", "")}`);
      if (url.endsWith("/v3/files")) return ok({ file_token: "file_1" });
      if (url.endsWith("/generation/image-to-model")) {
        expect(JSON.parse(init!.body as string)).toMatchObject({ input: "file_1", model: "v3.1-20260211", texture: true, pbr: true });
        return ok({ task_id: "task_1" });
      }
      if (url.endsWith("/tasks/task_1")) return ok(++polls < 2 ? { status: "running", progress: 40 } : { status: "success", output: { model_url: "https://cdn.test/m.glb" } });
      if (url === "https://cdn.test/m.glb") return new Response(new Uint8Array([1, 2, 3]));
      throw new Error("unexpected " + url);
    };
    const glb = await imageToGlb({ bytes: new Uint8Array([9]), filename: "boot.png" }, deps(fake));
    expect([...glb]).toEqual([1, 2, 3]);
    expect(calls).toEqual(["POST /v3/files", "POST /v3/generation/image-to-model", "GET /v3/tasks/task_1", "GET /v3/tasks/task_1", "GET https://cdn.test/m.glb"]);
  });

  it("surfaces API errors with message and suggestion (e.g. insufficient credits)", async () => {
    const fake = async () => new Response(JSON.stringify({ code: 2010, message: "Insufficient credits", suggestion: "Please top up your account" }), { status: 403 });
    await expect(createImageToModelTask("file_1", {}, deps(fake))).rejects.toThrow(/2010.*Insufficient credits.*top up/);
  });

  it("fails on failed tasks, reads balance and requires a key", async () => {
    const failed = async (url: string) => (url.endsWith("/files") ? ok({ file_token: "f" }) : url.includes("/generation/") ? ok({ task_id: "t" }) : ok({ status: "failed" }));
    await expect(imageToGlb({ bytes: new Uint8Array([1]), filename: "a.jpg" }, deps(failed))).rejects.toThrow(/failed/);
    expect(await getBalance(deps(async () => ok({ balance: 12 })))).toEqual({ balance: 12 });
    const prev = process.env.TRIPO_API_KEY;
    delete process.env.TRIPO_API_KEY;
    await expect(getBalance({ fetch: failed as unknown as typeof fetch })).rejects.toThrow(/TRIPO_API_KEY/);
    if (prev) process.env.TRIPO_API_KEY = prev;
  });

  it("extracts model urls and maps mime types", () => {
    expect(extractModelUrl({ model_url: "u" })).toBe("u");
    expect(extractModelUrl({ pbr_model: { url: "p" } })).toBe("p");
    expect(extractModelUrl({})).toBeNull();
    expect(mimeFor("a.JPEG")).toBe("image/jpeg");
    expect(mimeFor("a.webp")).toBe("image/webp");
  });
});
