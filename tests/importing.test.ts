import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { toProduct } from "@/lib/importing";
import { colorHex, inferRoleSubtype, parseCsv } from "@/lib/tagging";

describe("tagging", () => {
  it.each([
    ["Running Shorts", "bottom", "athletic-short"],
    ["Merino Trainer Socks", "accessory", "socks"],
    ["Bootcut Jeans", "bottom", "straight-jean"],
    ["Poplin Shirt Dress", "dress", "shirt-dress"],
    ["Suede Chelsea Boots", "shoes", "chelsea-boot"],
    ["Oxford Button-Down Shirt", "top", "oxford-shirt"],
    ["Cap-Toe Oxford Shoe", "shoes", "oxford"],
    ["Mini Crossbody Bag", "bag", "crossbody"],
    ["Organic Cotton T-Shirt", "top", "tee"],
  ])("%s -> %s/%s", (title, role, subtype) => {
    expect(inferRoleSubtype(title)).toEqual({ role, subtype });
  });

  it("skips things that never go in an outfit", () => {
    expect(inferRoleSubtype("OP T-shirt Bra")).toBeNull();
    expect(inferRoleSubtype("Swim Shorts")).toBeNull();
  });

  it("prefers the most specific color name", () => {
    expect(colorHex("Light Blue")).toBe("#a9c4e4");
    expect(colorHex("Washed Black")).toBe("#1c1c1e");
  });

  it("parses quoted CSV fields", () => {
    const rows = parseCsv('a,b\n"x, y","say ""hi"""\n');
    expect(rows).toEqual([{ a: "x, y", b: 'say "hi"' }]);
  });
});

describe("importers", () => {
  it("maps a stock sheet with missing fields", () => {
    const rows = parseCsv(readFileSync("tests/fixtures/stock.csv", "utf8"));
    const boots = toProduct({ title: rows[0].title, color: rows[0].color, price_cents: 18000, quantity: 4 }, "inventory")!;
    expect(boots).toMatchObject({ role: "shoes", subtype: "chelsea-boot", formality: 3, source: "inventory" });
    const heels = toProduct({ title: rows[1].title, price_cents: 14000, quantity: 6 }, "inventory")!;
    expect(heels).toMatchObject({ role: "shoes", subtype: "pump", gender: "women" });
    expect(toProduct({ title: "Gift card", price_cents: 2500 }, "inventory")).toBeNull();
  });

  it("maps H&M article rows", () => {
    const rows = parseCsv(readFileSync("tests/fixtures/hm-articles.csv", "utf8"));
    const jeans = rows.find((r) => r.prod_name === "Jeans Slim Fit")!;
    const p = toProduct({ title: jeans.prod_name, text: `${jeans.product_type_name} ${jeans.garment_group_name}`, color: jeans.colour_group_name, gender: "men", price_cents: 4000 }, "external")!;
    expect(p).toMatchObject({ role: "bottom", subtype: "slim-jean", gender: "men" });
    expect(p.color.name).toBe("dark blue");
  });
});
