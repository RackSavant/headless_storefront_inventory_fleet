"use client";

/**
 * R3F wrappers around the imperative builders in meshes.ts / mannequin.ts.
 * Objects are built once per product (or outfit) and dropped in as primitives.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useActiveAvatar, type AvatarProfile } from "@/lib/avatars";
import { composeTryOn } from "@/lib/tryon";
import type { Product } from "@/lib/types";
import { buildWornOutfit } from "./mannequin";
import { buildProcedural, buildProduct } from "./meshes";
import { frontSprite } from "./shots";

/** Height of the plain mannequin, floor to top of head. */
const MANNEQUIN_HEIGHT = 1.81;

/** Display model for a product on a fixture (hanging garments include a hanger). */
export function ProductModel({ product }: { product: Product }) {
  // Procedural geometry is instant; a real model file swaps in when it has loaded.
  const [obj, setObj] = useState<THREE.Object3D>(() => buildProcedural(product));
  useEffect(() => {
    if (!product.model_url) return;
    let alive = true;
    buildProduct(product).then((o) => alive && setObj(o));
    return () => {
      alive = false;
    };
  }, [product]);
  return <primitive object={obj} />;
}

/** The whole person from their photo, dressed in the outfit, standing where the mannequin would. */
function AvatarFigure({ items, avatar }: { items: Product[]; avatar: AvatarProfile }) {
  const cutout = avatar.cutout!;
  const canvas = useMemo(() => document.createElement("canvas"), []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [canvas]);
  const group = useRef<THREE.Group>(null);
  const key = items.map((p) => p.id).sort().join(",");

  useEffect(() => {
    let alive = true;
    (async () => {
      const layers = await Promise.all(items.map(async (p) => ({ product: p, sprite: await frontSprite(p) })));
      if (!alive) return;
      await composeTryOn(canvas, avatar.photo, avatar.anchors, layers, cutout);
      texture.needsUpdate = true;
    })().catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, avatar]);

  // Same height as the plain mannequin: head top to feet maps to MANNEQUIN_HEIGHT.
  const { w, h, x, y, width, height } = useMemo(() => {
    const cw = cutout.naturalWidth;
    const ch = cutout.naturalHeight;
    const s = MANNEQUIN_HEIGHT / (avatar.bbox.y1 - avatar.bbox.y0);
    const bx = (avatar.bbox.x0 + avatar.bbox.x1) / 2;
    return { x: (cw / 2 - bx) * s, y: (avatar.bbox.y1 - ch / 2) * s, width: cw * s, height: ch * s };
  }, [avatar, cutout]);

  // Turn about the vertical axis to face the camera, like a standee.
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const p = new THREE.Vector3();
    g.getWorldPosition(p);
    g.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
  });

  return (
    <group ref={group}>
      <mesh position={[x, y, 0]} renderOrder={2}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.02} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} scale={[1, 0.55, 1]}>
        <circleGeometry args={[0.38, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function WornOutfit({ items }: { items: Product[] }) {
  const avatar = useActiveAvatar();
  if (avatar?.cutout) return <AvatarFigure items={items} avatar={avatar} />;
  return <MannequinOutfit items={items} avatar={avatar} />;
}

function MannequinOutfit({ items, avatar }: { items: Product[]; avatar: AvatarProfile | null }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const key = items.map((p) => p.id).sort().join(",") + `|${avatar?.id ?? 0}`;
  useEffect(() => {
    let alive = true;
    buildWornOutfit(items, avatar).then((o) => alive && setObj(o));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return obj ? <primitive object={obj} /> : null;
}
