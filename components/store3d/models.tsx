"use client";

/**
 * R3F wrappers around the imperative builders in meshes.ts / mannequin.ts.
 * Objects are built once per product (or outfit) and dropped in as primitives.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { aiAvatarFit } from "@/lib/avatar-fit";
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
type FigureSource = { source: HTMLImageElement | HTMLCanvasElement; w: number; h: number; bbox: { x0: number; y0: number; x1: number; y1: number } };

function AvatarFigure({ items, avatar }: { items: Product[]; avatar: AvatarProfile }) {
  const bare = useMemo<FigureSource>(() => ({ source: avatar.cutout!, w: avatar.cutout!.naturalWidth, h: avatar.cutout!.naturalHeight, bbox: avatar.bbox }), [avatar]);
  const [fig, setFig] = useState<FigureSource>(bare);
  const [busy, setBusy] = useState(false);
  const group = useRef<THREE.Group>(null);
  const key = items.map((p) => p.id).sort().join(",");

  useEffect(() => {
    let alive = true;
    if (!items.length) {
      setFig(bare);
      setBusy(false);
      return;
    }
    setBusy(true);
    (async () => {
      // Photoreal fit from the product photos: cloth drapes and conforms to the body.
      const fit = await aiAvatarFit(avatar, items).catch(() => null);
      if (!alive) return;
      if (fit) {
        setFig({ source: fit.image, w: fit.image.naturalWidth, h: fit.image.naturalHeight, bbox: fit.bbox });
        return;
      }
      // No model available: fall back to the 2D composite on the cutout.
      const layers = await Promise.all(items.map(async (p) => ({ product: p, sprite: await frontSprite(p) })));
      if (!alive) return;
      const canvas = document.createElement("canvas");
      await composeTryOn(canvas, avatar.photo, avatar.anchors, layers, avatar.cutout!);
      if (alive) setFig({ source: canvas, w: canvas.width, h: canvas.height, bbox: avatar.bbox });
    })()
      .catch(() => {})
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, avatar]);

  const texture = useMemo(() => {
    const t = fig.source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(fig.source) : new THREE.Texture(fig.source);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }, [fig]);

  // Same height as the plain mannequin: head top to feet maps to MANNEQUIN_HEIGHT, whatever the image's aspect.
  const { x, y, width, height } = useMemo(() => {
    const s = MANNEQUIN_HEIGHT / (fig.bbox.y1 - fig.bbox.y0);
    const bx = (fig.bbox.x0 + fig.bbox.x1) / 2;
    return { x: (fig.w / 2 - bx) * s, y: (fig.bbox.y1 - fig.h / 2) * s, width: fig.w * s, height: fig.h * s };
  }, [fig]);

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
        <meshBasicMaterial map={texture} transparent opacity={busy ? 0.7 : 1} alphaTest={0.02} side={THREE.DoubleSide} toneMapped={false} />
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
