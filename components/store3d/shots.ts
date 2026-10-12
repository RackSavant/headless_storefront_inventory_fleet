"use client";

/**
 * Product shots: renders each product's 3D model offscreen with studio lighting
 * into a transparent PNG. Used as the product image wherever there's no real
 * photo, and (front view, no hanger) as cut-out garments for 2D photo try-on.
 * One shared renderer, a serial queue, results cached per product + view.
 */
import { useEffect, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { getActiveAvatar } from "@/lib/avatars";
import type { Product } from "@/lib/types";
import { buildMannequin } from "./mannequin";
import { buildProduct } from "./meshes";

export type ShotView = "hero" | "front";

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
const cache = new Map<string, Promise<Sprite>>();
let queue: Promise<unknown> = Promise.resolve();

function setup(size: number) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight("#ffffff", 1.6);
    key.position.set(2, 4, 3);
    const rim = new THREE.DirectionalLight("#fff2e0", 0.8);
    rim.position.set(-3, 2, -2);
    scene.add(key, rim, new THREE.AmbientLight("#ffffff", 0.25));
  }
  renderer.setSize(size, size, false);
  return { renderer, scene: scene! };
}

export interface Sprite {
  url: string;
  size: number;
  /** Model-space (meters) point at the image center, and half the visible extent. Lets try-on map pixels to meters. */
  center: { x: number; y: number };
  half: number;
}

async function render(p: Product, view: ShotView, size: number): Promise<Sprite> {
  const obj = await buildProduct(p, { hanger: view === "hero" ? true : false });
  // Size the shared renderer only now, after the async load, right before drawing.
  const { renderer, scene } = setup(size);
  const holder = new THREE.Group();
  holder.add(obj);
  const isShoe = p.role === "shoes";
  if (view === "hero") holder.rotation.y = isShoe || p.subtype === "socks" ? -Math.PI / 2.6 : p.role === "bag" ? -0.45 : 0;
  else if (isShoe) holder.rotation.y = 0; // toe toward camera for feet in try-on
  scene.add(holder);
  holder.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(holder);
  const center = box.getCenter(new THREE.Vector3());
  const dims = box.getSize(new THREE.Vector3());
  let camera: THREE.Camera;
  let half = 0;
  if (view === "front") {
    // Orthographic front view: exact flat cut-out with known scale for try-on.
    half = (Math.max(dims.x, dims.y) / 2) * 1.04;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 10);
    cam.position.set(center.x, center.y, center.z + 3);
    cam.lookAt(center);
    camera = cam;
  } else {
    const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
    const radius = dims.length() / 2;
    const dist = radius / Math.sin((cam.fov * Math.PI) / 360) * 1.02;
    const dir = isShoe || p.role === "bag" || p.role === "accessory" ? new THREE.Vector3(0, 0.35, 1).normalize() : new THREE.Vector3(0, 0.05, 1).normalize();
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.lookAt(center);
    camera = cam;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(holder);
  return { url, size, center: { x: center.x, y: center.y }, half };
}

/** Product image URL: the real photo when the product has one, otherwise a rendered shot. */
function rendered(p: Product, view: ShotView, size: number): Promise<Sprite> {
  const key = `${p.id}|${view}|${size}`;
  let hit = cache.get(key);
  if (!hit) {
    // Serialize renders so a grid of cards doesn't stall the main thread at once.
    hit = queue.then(() => new Promise<void>((r) => setTimeout(r, 0))).then(() => render(p, view, size));
    queue = hit.catch(() => null);
    cache.set(key, hit);
  }
  return hit;
}

export function productShot(p: Product, view: ShotView = "hero", size = 384): Promise<string> {
  if (view === "hero" && p.image_url) return Promise.resolve(p.image_url);
  return rendered(p, view, size).then((s) => s.url);
}

/** Front-on cut-out (no hanger, transparent) with its pixel-to-meter mapping, for try-on. */
export function frontSprite(p: Product, size = 768): Promise<Sprite> {
  return rendered(p, "front", size);
}

export function useProductShot(p: Product | null, view: ShotView = "hero", size = 384): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!p) return;
    let alive = true;
    setUrl(null);
    productShot(p, view, size)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [p, view, size]);
  return url;
}

/** A full-length studio "photo" of the bare mannequin, for trying outfits on a model instead of yourself. */
export function modelPhoto(width = 720, height = 1080): Promise<string> {
  // Same queue as product shots: the renderer is shared and resized per job.
  const job = queue.then(() => renderModel(width, height));
  queue = job.catch(() => null);
  return job;
}

function renderModel(width: number, height: number): string {
  const { renderer, scene } = setup(Math.max(width, height));
  renderer.setSize(width, height, false);
  const body = buildMannequin(true, getActiveAvatar());
  scene.add(body);
  const cam = new THREE.PerspectiveCamera(30, width / height, 0.1, 20);
  cam.position.set(0, 0.95, 4.1);
  cam.lookAt(0, 0.9, 0);
  renderer.setClearColor(0xe9e4dc, 1);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL("image/jpeg", 0.92);
  scene.remove(body);
  renderer.setClearColor(0x000000, 0);
  return url;
}
