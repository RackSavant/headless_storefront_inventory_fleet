"use client";

/**
 * Renders a World Labs Marble world (.spz Gaussian splat) as the store
 * backdrop, using Spark like the spatialintelligence viewer. Fixtures and
 * products are still placed in the app's metric, Y-up frame on top of it.
 *
 * Marble worlds are Y-down in arbitrary units: scale and ground offset come
 * from the world's semantics_metadata (metric_scale_factor, ground_plane_offset).
 */
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";

const SCALE = Number(process.env.NEXT_PUBLIC_STORE_WORLD_SCALE || 1);
const GROUND = Number(process.env.NEXT_PUBLIC_STORE_WORLD_GROUND || 0);

export default function SplatBackdrop({ url }: { url: string }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    import("@sparkjsdev/spark").then(({ SparkRenderer, SplatMesh }) => {
      if (disposed) return;
      const spark = new SparkRenderer({ renderer: gl });
      scene.add(spark);
      // Same nesting as lib/world-frame.ts in the spatial repo: flip, then offset+scale.
      const align = new THREE.Group();
      align.quaternion.set(1, 0, 0, 0);
      const content = new THREE.Group();
      content.scale.setScalar(SCALE);
      content.position.y = -GROUND;
      align.add(content);
      const splat = new SplatMesh({ url });
      content.add(splat);
      scene.add(align);
      cleanup = () => {
        scene.remove(align);
        scene.remove(spark);
        splat.dispose();
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [gl, scene, url]);

  return null;
}
