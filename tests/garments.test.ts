import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildGarment, fabricMaterial } from "@/components/store3d/meshes";
import { toProduct } from "@/lib/importing";

describe("garment realism", () => {
  it.each(["Cotton T-Shirt", "Silk Slip Dress", "Wide Leg Trousers", "Denim Jacket"])("gives %s a curved cloth surface within a bounded mesh budget", (title) => {
    const product = toProduct({ title, price_cents: 5000 }, "inventory")!;
    const garment = buildGarment(product, { hanger: false });
    const body = garment.children[0] as THREE.Mesh;
    const positions = body.geometry.getAttribute("position");
    const depths = new Set<number>();
    for (let i = 0; i < positions.count; i++) {
      expect(Number.isFinite(positions.getZ(i))).toBe(true);
      depths.add(Math.round(positions.getZ(i) * 10000));
    }
    expect(depths.size).toBeGreaterThan(30);
    expect(positions.count).toBeLessThan(30000);
    body.geometry.computeBoundingBox();
    expect(body.geometry.boundingBox!.max.z).toBeLessThan(0.15);
    expect(body.geometry.boundingBox!.min.z).toBeGreaterThan(-0.15);
  });

  it.each(["leather", "suede", "cotton", "denim", "knit", "nylon"] as const)("uses sub-centimeter relief for %s", (fabric) => {
    const mat = fabricMaterial("#826c55", fabric) as THREE.MeshStandardMaterial;
    expect(mat.bumpScale).toBeGreaterThan(0);
    expect(mat.bumpScale).toBeLessThan(0.01);
  });

  it("keeps hanger placement separate from the try-on shoulder origin", () => {
    const product = toProduct({ title: "Cotton T-Shirt", price_cents: 5000 }, "inventory")!;
    const hanging = buildGarment(product);
    const worn = buildGarment(product, { hanger: false });
    expect(hanging.children[0].position.y - worn.children[0].position.y).toBeCloseTo(-0.1);
    expect(hanging.children.length).toBeGreaterThan(worn.children.length);
  });
});
