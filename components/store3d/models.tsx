"use client";

/**
 * R3F wrappers around the imperative builders in meshes.ts / mannequin.ts.
 * Objects are built once per product (or outfit) and dropped in as primitives.
 */
import { useEffect, useState } from "react";
import type * as THREE from "three";
import type { Product } from "@/lib/types";
import { buildWornOutfit } from "./mannequin";
import { buildProcedural, buildProduct, disposeProduct } from "./meshes";

/** Display model for a product on a fixture (hanging garments include a hanger). */
export function ProductModel({ product }: { product: Product }) {
  // Procedural geometry is instant; a real model file swaps in when it has loaded.
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let alive = true;
    let current: THREE.Object3D = buildProcedural(product);
    setObj(current);
    if (product.model_url) buildProduct(product).then((object) => {
      if (!alive) { disposeProduct(object); return; }
      disposeProduct(current);
      current = object;
      setObj(object);
    });
    return () => {
      alive = false;
      disposeProduct(current);
    };
  }, [product]);
  return obj ? <primitive object={obj} /> : null;
}

export function WornOutfit({ items }: { items: Product[] }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const key = items.map((p) => p.id).sort().join(",");
  useEffect(() => {
    let alive = true;
    buildWornOutfit(items).then((o) => alive && setObj(o));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return obj ? <primitive object={obj} /> : null;
}
