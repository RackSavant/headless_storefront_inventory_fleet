/**
 * Mannequin + worn garments. The body is built from lathe profiles and tapered
 * limbs; each garment is the body surface pushed outward by an ease amount over
 * the range it covers, so clothes follow the figure instead of being boxes.
 * Faces +z, feet at y=0, ~1.78 m tall.
 */
import * as THREE from "three";
import type { Product } from "@/lib/types";
import { buildBag, buildProduct, fabricMaterial, fabricOf } from "./meshes";

const SKIN = new THREE.MeshPhysicalMaterial({ color: "#ebe5dc", roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.5 });
const DEPTH = 0.64; // torso front-to-back vs side-to-side

/** Torso radius (side to side) at height y. */
const TORSO: Array<[number, number]> = [
  [0.84, 0.05],
  [0.87, 0.15],
  [0.93, 0.178],
  [1.0, 0.168],
  [1.08, 0.142],
  [1.18, 0.152],
  [1.28, 0.172],
  [1.36, 0.176],
  [1.42, 0.162],
  [1.46, 0.12],
  [1.49, 0.06],
];

function torsoR(y: number): number {
  if (y <= TORSO[0][0]) return TORSO[0][1];
  for (let i = 1; i < TORSO.length; i++) {
    const [y1, r1] = TORSO[i];
    const [y0, r0] = TORSO[i - 1];
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      const s = t * t * (3 - 2 * t);
      return r0 + (r1 - r0) * s;
    }
  }
  return TORSO[TORSO.length - 1][1];
}

/** Lathe around the body from y0 to y1, radius = torso + ease (+ optional flare below `flareFrom`). */
function shell(y0: number, y1: number, ease: number, mat: THREE.Material, flare?: { from: number; to: number }) {
  const pts: THREE.Vector2[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const y = y0 + ((y1 - y0) * i) / N;
    let r = torsoR(Math.max(0.87, y)) + ease;
    if (flare && y < flare.from) r += ((flare.from - y) / (flare.from - y0)) * flare.to;
    pts.push(new THREE.Vector2(r, y));
  }
  const geo = new THREE.LatheGeometry(pts, 64);
  const positions = geo.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const angle = Math.atan2(x, z);
    const t = (y1 - y) / (y1 - y0);
    const release = Math.sin(Math.PI * t * 0.85) ** 2;
    const fold = (0.003 + (flare ? 0.009 * t : ease * 0.12)) * release * (1 + Math.sin(angle * 12 + t * 3));
    positions.setXYZ(i, x + Math.sin(angle) * fold, y, z + Math.cos(angle) * fold);
  }
  geo.scale(1, 1, DEPTH);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  // open top/bottom need inside faces visible
  (mat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  return m;
}

/** Tapered limb segment between two points. */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, mat: THREE.Material, open = false) {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(rb, ra, len, 20, 1, open);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}

function ball(p: THREE.Vector3, r: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
  m.position.copy(p);
  m.castShadow = true;
  return m;
}

// Skeleton landmarks (right side; mirror x for left)
const J = {
  shoulder: new THREE.Vector3(0.195, 1.415, 0),
  elbow: new THREE.Vector3(0.235, 1.13, -0.01),
  wrist: new THREE.Vector3(0.255, 0.86, 0.02),
  hip: new THREE.Vector3(0.095, 0.9, 0),
  knee: new THREE.Vector3(0.092, 0.5, 0.01),
  ankle: new THREE.Vector3(0.088, 0.09, -0.01),
};
const mirror = (v: THREE.Vector3, s: number) => new THREE.Vector3(v.x * s, v.y, v.z);
const R = { upperArm: [0.05, 0.04], foreArm: [0.038, 0.029], thigh: [0.078, 0.055], shin: [0.052, 0.036] };

export function buildMannequin(barefoot: boolean): THREE.Group {
  const g = new THREE.Group();
  const torso = new THREE.LatheGeometry(TORSO.map(([y, r]) => new THREE.Vector2(r, y)), 48);
  torso.scale(1, 1, DEPTH);
  g.add(Object.assign(new THREE.Mesh(torso, SKIN), { castShadow: true }));
  for (const s of [-1, 1]) {
    g.add(ball(mirror(J.shoulder, s), 0.055, SKIN));
    g.add(limb(mirror(J.shoulder, s), mirror(J.elbow, s), R.upperArm[0], R.upperArm[1], SKIN));
    g.add(ball(mirror(J.elbow, s), 0.04, SKIN));
    g.add(limb(mirror(J.elbow, s), mirror(J.wrist, s), R.foreArm[0], R.foreArm[1], SKIN));
    const hand = ball(mirror(J.wrist, s).add(new THREE.Vector3(0.004 * s, -0.06, 0.01)), 0.04, SKIN);
    hand.scale.set(0.55, 1.2, 0.9);
    g.add(hand);
    g.add(limb(mirror(J.hip, s), mirror(J.knee, s), R.thigh[0], R.thigh[1], SKIN));
    g.add(ball(mirror(J.knee, s), 0.054, SKIN));
    g.add(limb(mirror(J.knee, s), mirror(J.ankle, s), R.shin[0], R.shin[1], SKIN));
    if (barefoot) {
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.16, 6, 12), SKIN);
      foot.rotation.x = Math.PI / 2;
      foot.scale.set(1.1, 1, 0.7);
      foot.position.copy(mirror(J.ankle, s)).add(new THREE.Vector3(0, -0.055, 0.06));
      g.add(foot);
    }
  }
  g.add(limb(new THREE.Vector3(0, 1.47, 0), new THREE.Vector3(0, 1.58, 0.005), 0.052, 0.047, SKIN));
  const head = ball(new THREE.Vector3(0, 1.69, 0.01), 0.1, SKIN);
  head.scale.set(0.92, 1.18, 1);
  g.add(head);
  return g;
}

/* ---------------- garments on the body ---------------- */

function sleeves(g: THREE.Group, mat: THREE.Material, length: "short" | "long", ease: number) {
  for (const s of [-1, 1]) {
    const sh = mirror(J.shoulder, s);
    const el = mirror(J.elbow, s);
    g.add(ball(sh, 0.055 + ease, mat));
    if (length === "short") {
      const end = sh.clone().lerp(el, 0.45);
      g.add(limb(sh, end, R.upperArm[0] + ease + 0.012, R.upperArm[0] + ease + 0.016, mat, true));
    } else {
      g.add(limb(sh, el, R.upperArm[0] + ease, R.upperArm[1] + ease, mat));
      g.add(ball(el, R.upperArm[1] + ease, mat));
      g.add(limb(el, mirror(J.wrist, s).add(new THREE.Vector3(0, 0.03, 0)), R.foreArm[0] + ease, R.foreArm[1] + ease + 0.004, mat, true));
    }
  }
}

function wornTop(p: Product, outer: boolean): THREE.Group {
  const g = new THREE.Group();
  const s = p.subtype;
  const mat = fabricMaterial(p.color.hex, fabricOf(p), { repeat: 10 }).clone();
  const coat = s === "wool-coat" || s === "trench-coat";
  const ease = outer ? (s === "puffer" ? 0.06 : 0.035) : 0.014;
  const hem = coat ? 0.42 : outer ? 0.82 : s === "hoodie" ? 0.86 : 0.9;
  const tank = s === "tank" || s === "silk-camisole";
  g.add(shell(hem, tank ? 1.4 : 1.475, ease, mat, coat ? { from: 0.85, to: 0.09 } : undefined));
  if (!tank) sleeves(g, mat, !outer && /tee|polo|band-tee/.test(s) ? "short" : "long", ease * 0.8);
  else
    for (const sx of [-1, 1])
      g.add(limb(new THREE.Vector3(sx * 0.08, 1.4, 0.07), new THREE.Vector3(sx * 0.11, 1.47, 0.0), 0.006, 0.006, mat));
  if (outer) {
    const front = torsoR(1.2) * DEPTH + ease * DEPTH + 0.004;
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.46 - hem, 0.006), fabricMaterial("#1c1917", "cotton"));
    placket.position.set(0, (1.46 + hem) / 2, front);
    placket.material = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color.hex).multiplyScalar(0.6), roughness: 0.8 });
    g.add(placket);
    if (/blazer|trench|wool-coat/.test(s)) {
      for (const sx of [-1, 1]) {
        const lap = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.24), placket.material);
        lap.position.set(sx * 0.05, 1.33, front + 0.004);
        lap.rotation.z = sx * 0.35;
        g.add(lap);
      }
    }
  }
  if (s === "hoodie") {
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.045, 10, 24), mat);
    hood.rotation.x = Math.PI / 2 - 0.4;
    hood.position.set(0, 1.47, -0.05);
    g.add(hood);
  }
  return g;
}

function wornBottom(p: Product): THREE.Group {
  const g = new THREE.Group();
  const s = p.subtype;
  const mat = fabricMaterial(p.color.hex, fabricOf(p), { repeat: 12 }).clone();
  if (/skirt/.test(s)) {
    const hem = s === "mini-skirt" ? 0.66 : 0.38;
    g.add(shell(hem, 1.02, 0.012, mat, { from: 0.95, to: s === "mini-skirt" ? 0.06 : 0.13 }));
    return g;
  }
  const ease = s === "legging" ? 0.004 : 0.016;
  g.add(shell(0.85, 1.02, ease, mat));
  const shorts = /short/.test(s);
  const hemR = s === "wide-leg-trouser" ? 0.12 : s === "jogger" || s === "legging" ? 0.045 : s === "straight-jean" || s === "chino" || s === "cargo-pant" ? 0.065 : 0.055;
  for (const sx of [-1, 1]) {
    const hip = mirror(J.hip, sx).add(new THREE.Vector3(0, 0.02, 0));
    const knee = mirror(J.knee, sx);
    if (shorts) {
      const end = hip.clone().lerp(knee, 0.55);
      g.add(limb(hip, end, R.thigh[0] + 0.02, R.thigh[0] + 0.025, mat, true));
      continue;
    }
    g.add(limb(hip, knee, R.thigh[0] + ease + 0.004, R.thigh[1] + ease + (s === "wide-leg-trouser" ? 0.03 : 0.006), mat));
    g.add(ball(knee, R.thigh[1] + ease + (s === "wide-leg-trouser" ? 0.03 : 0.006), mat));
    const ankle = mirror(J.ankle, sx).add(new THREE.Vector3(0, s === "chino" ? 0.04 : 0.015, 0));
    g.add(limb(knee, ankle, R.thigh[1] + ease + (s === "wide-leg-trouser" ? 0.03 : 0.006), hemR, mat, true));
  }
  return g;
}

function wornDress(p: Product): THREE.Group {
  const g = new THREE.Group();
  const s = p.subtype;
  const mat = fabricMaterial(p.color.hex, fabricOf(p), { repeat: 10 }).clone();
  const hem = s === "maxi-dress" ? 0.1 : s === "cocktail-dress" ? 0.6 : s === "knit-midi-dress" ? 0.36 : 0.44;
  const straps = s === "slip-dress" || s === "sundress" || s === "maxi-dress";
  g.add(shell(1.0, straps ? 1.4 : 1.475, 0.012, mat));
  g.add(shell(hem, 1.02, 0.014, mat, { from: 1.0, to: s === "cocktail-dress" ? 0.08 : s === "knit-midi-dress" ? 0.06 : 0.16 }));
  if (straps) for (const sx of [-1, 1]) g.add(limb(new THREE.Vector3(sx * 0.08, 1.39, 0.08), new THREE.Vector3(sx * 0.11, 1.47, 0.0), 0.005, 0.005, mat));
  else sleeves(g, mat, s === "knit-midi-dress" ? "long" : "short", 0.01);
  return g;
}

function wornAccessory(p: Product): THREE.Object3D | null {
  const mat = fabricMaterial(p.color.hex, fabricOf(p), { repeat: 8 });
  const s = p.subtype;
  if (s === "belt") {
    const m = new THREE.Mesh(new THREE.TorusGeometry(torsoR(1.0) + 0.02, 0.014, 6, 40), mat);
    m.rotation.x = Math.PI / 2;
    m.scale.set(1, DEPTH + 0.05, 1);
    m.position.y = 1.0;
    return m;
  }
  if (s === "socks") {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) g.add(limb(mirror(J.ankle, sx), mirror(J.ankle, sx).add(new THREE.Vector3(0, 0.12, 0)), R.shin[1] + 0.006, R.shin[1] + 0.008, mat));
    return g;
  }
  if (s === "scarf") {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.045, 12, 28), mat);
    m.rotation.x = Math.PI / 2 - 0.2;
    m.position.set(0, 1.49, 0.01);
    return m;
  }
  if (s === "necklace") {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.003, 6, 40), mat);
    m.rotation.x = Math.PI / 2 - 0.55;
    m.position.set(0, 1.43, 0.035);
    return m;
  }
  if (s === "watch") {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.01, 8, 24), mat);
    m.position.copy(mirror(J.wrist, -1)).add(new THREE.Vector3(0, 0.03, 0));
    m.rotation.x = Math.PI / 2;
    return m;
  }
  if (s === "sunglasses") {
    const g = new THREE.Group();
    for (const x of [-0.035, 0.035]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 20), new THREE.MeshPhysicalMaterial({ color: "#151515", roughness: 0.05 }));
      l.rotation.x = Math.PI / 2;
      l.position.set(x, 1.71, 0.1);
      g.add(l);
    }
    return g;
  }
  if (s === "beanie" || s === "cap" || s === "sun-hat") {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.105, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    crown.position.set(0, 1.72, 0.01);
    crown.scale.y = s === "beanie" ? 1.05 : 0.85;
    if (s === "beanie") return crown;
    const g = new THREE.Group();
    g.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(s === "cap" ? 0.11 : 0.22, s === "cap" ? 0.11 : 0.22, 0.006, 40), mat);
    brim.position.set(0, 1.72, s === "cap" ? 0.08 : 0.01);
    if (s === "cap") brim.scale.set(0.85, 1, 0.6);
    g.add(brim);
    return g;
  }
  return null;
}

/** Dress the mannequin. Async because shoes may be real models (e.g. the FBX stiletto). */
export async function buildWornOutfit(items: Product[]): Promise<THREE.Group> {
  const by = (role: Product["role"]) => items.find((p) => p.role === role);
  const shoes = by("shoes");
  const top = by("top");
  const bottom = by("bottom");
  const dress = by("dress");
  const outer = by("outerwear");
  const bag = by("bag");
  const acc = by("accessory");

  const g = new THREE.Group();
  g.add(buildMannequin(!shoes));
  if (acc?.subtype === "socks") g.add(wornAccessory(acc)!);
  if (bottom && !dress) g.add(wornBottom(bottom));
  if (dress) g.add(wornDress(dress));
  if (top && !dress) g.add(wornTop(top, false));
  if (outer) g.add(wornTop(outer, true));
  if (shoes) {
    for (const sx of [-1, 1]) {
      const shoe = await buildProduct(shoes);
      shoe.position.set(sx * 0.09, 0, 0.045);
      g.add(shoe);
    }
  }
  if (bag) {
    const b = buildBag(bag);
    if (bag.subtype === "backpack") {
      b.position.set(0, 1.0, -0.2);
    } else {
      b.rotation.y = Math.PI / 2;
      b.position.set(0.31, bag.subtype === "tote" ? 0.66 : 0.82, 0.02);
    }
    g.add(b);
  }
  if (acc && acc.subtype !== "socks" && !(acc.subtype === "belt" && (outer || dress))) {
    const a = wornAccessory(acc);
    if (a) g.add(a);
  }
  return g;
}
