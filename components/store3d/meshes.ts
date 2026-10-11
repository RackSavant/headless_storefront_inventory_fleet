/**
 * Product geometry, built imperatively so the same object serves the 3D store,
 * the mannequin, product shots and try-on sprites.
 *
 *  - Shoes: a footprint outline (toe shape per style) extruded into a sole that
 *    bends over the heel, a parametric upper with a real foot opening, then
 *    heels, shafts, laces, straps and gussets per subtype.
 *  - Garments: sewing-pattern silhouettes extruded with soft bevels.
 *  - Materials: procedural fabric textures (leather grain, suede, denim twill,
 *    knit rib, canvas weave) used as color and bump maps.
 *  - Products with a model_url load that file (GLB, or FBX like the stiletto).
 */
import * as THREE from "three";
import type { Product } from "@/lib/types";

/* ================================================================== */
/* Fabric textures + materials                                         */
/* ================================================================== */

type Fabric = "leather" | "suede" | "canvas" | "denim" | "knit" | "satin" | "wool" | "cotton" | "nylon" | "metal" | "rubber";

const texCache = new Map<string, THREE.CanvasTexture>();

function fabricTexture(kind: Fabric): THREE.CanvasTexture | null {
  if (kind === "satin" || kind === "metal" || kind === "rubber") return null;
  const hit = texCache.get(kind);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, S, S);
  const rnd = mulberry(kind.length * 97);
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let v = 1;
      switch (kind) {
        case "leather": {
          // pebbled grain: cellular-ish noise
          const n = valueNoise(x / 6, y / 6, 3) * 0.6 + valueNoise(x / 2.5, y / 2.5, 7) * 0.4;
          v = 0.86 + 0.14 * Math.pow(n, 1.6);
          break;
        }
        case "suede":
          v = 0.8 + 0.2 * rnd() * (0.6 + 0.4 * valueNoise(x / 10, y / 10, 5));
          break;
        case "canvas":
          v = 0.82 + 0.09 * (Math.sin(x * 1.6) > 0 ? 1 : 0) + 0.09 * (Math.sin(y * 1.6) > 0 ? 1 : 0) - 0.04 * rnd();
          break;
        case "denim": {
          const tw = Math.sin((x + y) * 0.9) * 0.5 + 0.5; // 45° twill
          v = 0.72 + 0.22 * tw + 0.08 * (rnd() - 0.5) + 0.06 * valueNoise(x / 30, y / 4, 11);
          break;
        }
        case "knit":
          v = 0.78 + 0.22 * Math.pow(Math.abs(Math.sin(x * 0.55)), 0.6) - 0.05 * Math.abs(Math.sin(y * 0.9));
          break;
        case "wool":
          v = 0.84 + 0.16 * valueNoise(x / 3, y / 3, 13) - 0.04 * rnd();
          break;
        case "nylon":
          v = 0.9 + 0.1 * (Math.sin(y * 0.7) > 0.6 ? 1 : 0);
          break;
        default:
          v = 0.93 + 0.07 * valueNoise(x / 2, y / 2, 17);
      }
      const b = Math.max(0, Math.min(255, Math.round(v * 255)));
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = b;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  texCache.set(kind, t);
  return t;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, s: number) {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise(x: number, y: number, s: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fabricOf(p: Product, part: "main" | "sole" = "main"): Fabric {
  const t = `${p.title} ${p.subtype} ${p.color.name}`.toLowerCase();
  if (part === "sole") return "rubber";
  if (/suede/.test(t)) return "suede";
  if (/denim|jean/.test(t)) return "denim";
  if (/canvas|tote|linen|chino|cargo|trench/.test(t)) return "canvas";
  if (/knit|rib|sweater|cardigan|sock|beanie|cashmere/.test(t)) return "knit";
  if (/wool|coat|scarf|fleece|sherpa/.test(t)) return "wool";
  if (/satin|silk|slip|camisole|cocktail|clutch/.test(t)) return "satin";
  if (/nylon|puffer|backpack|running|performance|bomber/.test(t)) return "nylon";
  if (/gold|silver|steel|chain|watch/.test(t)) return "metal";
  if (/leather|boot|loafer|oxford|derby|pump|stiletto|slide|belt|crossbody|sandal|moto/.test(t)) return "leather";
  return "cotton";
}

const matCache = new Map<string, THREE.Material>();

export function fabricMaterial(color: string, fabric: Fabric, opts: { repeat?: number; side?: THREE.Side } = {}): THREE.Material {
  const key = `${color}|${fabric}|${opts.repeat ?? 1}|${opts.side ?? 0}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  const tex = fabricTexture(fabric);
  let map: THREE.Texture | null = null;
  if (tex) {
    map = tex.clone();
    map.needsUpdate = true;
    const r = opts.repeat ?? 6;
    map.repeat.set(r, r);
  }
  const base = { color: new THREE.Color(color), side: opts.side ?? THREE.FrontSide };
  let m: THREE.Material;
  switch (fabric) {
    case "leather":
      m = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.5, clearcoat: 0.12, clearcoatRoughness: 0.45, envMapIntensity: 0.55, map, bumpMap: map, bumpScale: 0.6 });
      break;
    case "suede":
      m = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.95, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.35), map, bumpMap: map, bumpScale: 0.3 });
      break;
    case "satin":
      // Sheen tinted by the fabric's own color: a white sheen washes saturated satins out to pastel.
      m = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.32, envMapIntensity: 0.6, sheen: 0.5, sheenRoughness: 0.35, sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.25) });
      break;
    case "metal":
      m = new THREE.MeshStandardMaterial({ ...base, roughness: 0.22, metalness: 1 });
      break;
    case "rubber":
      m = new THREE.MeshStandardMaterial({ ...base, roughness: 0.75 });
      break;
    case "nylon":
      m = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.45, clearcoat: 0.2, map, bumpMap: map, bumpScale: 0.2 });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ ...base, roughness: fabric === "wool" || fabric === "knit" ? 0.95 : 0.85, map, bumpMap: map, bumpScale: 0.8 });
  }
  matCache.set(key, m);
  return m;
}

function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/* ================================================================== */
/* Shoes                                                               */
/* ================================================================== */

type Toe = "round" | "almond" | "pointed" | "square";

interface ShoeSpec {
  L: number;
  W: number;
  toe: Toe;
  /** Heel lift at the back of the foot (m). */
  heel: number;
  heelType: "flat" | "stacked" | "block" | "stiletto";
  sole: number;
  soleColor: string;
  /** Upper height profile: [u, height] control points, heel (0) to toe (1). */
  upper: Array<[number, number]> | null;
  /** Foot opening: up to this u the top of the upper is open. */
  collarU: number;
  shaft: number;
  kind: "sneaker" | "boot" | "pump" | "sandal" | "slide" | "dress";
}

function shoeSpec(p: Product): ShoeSpec {
  const s = p.subtype;
  const base: ShoeSpec = {
    L: 0.27,
    W: 0.098,
    toe: "round",
    heel: 0.018,
    heelType: "stacked",
    sole: 0.012,
    soleColor: "#2a2420",
    upper: [[0, 0.058], [0.2, 0.06], [0.45, 0.062], [0.7, 0.044], [0.88, 0.03], [1, 0.0]],
    collarU: 0.36,
    shaft: 0,
    kind: "dress",
  };
  if (/sneaker|trainer|running/.test(s)) {
    return {
      ...base,
      toe: "round",
      heel: 0.012,
      heelType: "flat",
      sole: s === "canvas-sneaker" ? 0.045 : s === "running-shoe" ? 0.034 : 0.026,
      soleColor: s === "running-shoe" ? "#e9ecef" : "#f4f2ec",
      upper: [[0, 0.066], [0.18, 0.068], [0.42, 0.074], [0.65, 0.055], [0.85, 0.036], [1, 0.0]],
      collarU: 0.34,
      kind: "sneaker",
    };
  }
  if (/boot/.test(s)) {
    return {
      ...base,
      heel: s === "ankle-boot" ? 0.045 : 0.025,
      heelType: s === "ankle-boot" ? "block" : "stacked",
      sole: s === "combat-boot" || s === "hiking-boot" ? 0.03 : 0.014,
      soleColor: s === "hiking-boot" ? "#3b2f25" : "#1f1b18",
      upper: [[0, 0.07], [0.22, 0.075], [0.45, 0.072], [0.7, 0.05], [0.88, 0.034], [1, 0]],
      collarU: 0.3,
      shaft: s === "combat-boot" ? 0.12 : s === "hiking-boot" ? 0.08 : s === "chelsea-boot" ? 0.085 : 0.07,
      kind: "boot",
    };
  }
  if (s === "stiletto" || s === "pump") {
    return {
      ...base,
      W: 0.085,
      toe: "pointed",
      heel: s === "stiletto" ? 0.1 : 0.08,
      heelType: "stiletto",
      sole: 0.006,
      soleColor: "#1a1412",
      upper: [[0, 0.06], [0.15, 0.05], [0.4, 0.03], [0.62, 0.032], [0.8, 0.034], [1, 0]],
      collarU: 0.66,
      kind: "pump",
    };
  }
  if (s === "strappy-sandal") return { ...base, W: 0.09, toe: "square", heel: 0.06, heelType: "block", sole: 0.008, soleColor: "#c8a682", upper: null, collarU: 1, kind: "sandal" };
  if (s === "slide") return { ...base, toe: "round", heel: 0.01, heelType: "flat", sole: 0.026, soleColor: shade(p.color.hex, -0.12), upper: null, collarU: 1, kind: "slide" };
  if (s === "loafer") return { ...base, toe: "almond", upper: [[0, 0.05], [0.2, 0.052], [0.45, 0.064], [0.7, 0.048], [0.88, 0.033], [1, 0]], collarU: 0.42 };
  return { ...base, toe: "almond" }; // oxford, derby
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function halfWidth(u: number, sp: ShoeSpec): number {
  const Wb = sp.W / 2;
  const Wh = Wb * 0.7;
  if (u <= 0.1) return Wh * Math.sqrt(Math.max(0, 1 - Math.pow((0.1 - u) / 0.1, 2)));
  if (u <= 0.72) return Wh + (Wb - Wh) * smooth(0.1, 0.72, u) - 0.004 * Math.sin((Math.PI * (u - 0.1)) / 0.62);
  const t = Math.min(1, (u - 0.72) / 0.28);
  switch (sp.toe) {
    case "pointed":
      return Wb * Math.pow(Math.max(0, 1 - t), 1.15) * (1 - 0.15 * t);
    case "almond":
      return Wb * Math.pow(Math.max(0, 1 - Math.pow(t, 1.5)), 0.7);
    case "square":
      return Wb * Math.pow(Math.max(0, 1 - Math.pow(t, 5)), 0.25) * (1 - 0.1 * t);
    default:
      return Wb * Math.sqrt(Math.max(0, 1 - t * t));
  }
}

/** Height of the sole bottom above the ground at u (heel drop to the ball of the foot). */
function lift(u: number, sp: ShoeSpec): number {
  return sp.heel * (1 - smooth(0.22, 0.66, u));
}

function interp(points: Array<[number, number]>, u: number): number {
  for (let i = 1; i < points.length; i++) {
    const [u0, h0] = points[i - 1];
    const [u1, h1] = points[i];
    if (u <= u1) {
      const t = smooth(0, 1, (u - u0) / (u1 - u0));
      return h0 + (h1 - h0) * t;
    }
  }
  return points[points.length - 1][1];
}

function soleGeometry(sp: ShoeSpec): THREE.BufferGeometry {
  const N = 48;
  const shape = new THREE.Shape();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    pts.push(new THREE.Vector2(halfWidth(u, sp) + 0.004, u * sp.L));
  }
  for (let i = N; i >= 0; i--) {
    const u = i / N;
    pts.push(new THREE.Vector2(-(halfWidth(u, sp) + 0.004), u * sp.L));
  }
  shape.setFromPoints(pts);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: sp.sole, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 4 });
  geo.rotateX(Math.PI / 2); // length -> +z, thickness -> -y
  geo.translate(0, sp.sole, -sp.L / 2);
  // Bend over the heel.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getZ(i) + sp.L / 2) / sp.L;
    pos.setY(i, pos.getY(i) + lift(u, sp));
  }
  geo.computeVertexNormals();
  return geo;
}

/** Half-angle of the foot opening at u (0 = closed). Zero at the back seam, so the heel counter stays. */
function openHalf(u: number, sp: ShoeSpec): number {
  return (Math.PI / 2) * 0.62 * smooth(0.0, 0.1, u) * (1 - smooth(sp.collarU - 0.14, sp.collarU, u));
}

function upperPoint(u: number, v: number, sp: ShoeSpec): THREE.Vector3 {
  const w = halfWidth(u, sp) * 1.01;
  const h = interp(sp.upper!, u);
  return new THREE.Vector3(w * Math.cos(v), lift(u, sp) + sp.sole + h * Math.pow(Math.sin(v), 0.92), u * sp.L - sp.L / 2);
}

/**
 * The upper as two strips (outside edge -> opening edge, each side). Each row's
 * v-range ends exactly on the opening curve, so the collar line is smooth
 * instead of stair-stepped. Where the opening has closed, the strips meet at the top.
 */
function upperGeometry(sp: ShoeSpec): THREE.BufferGeometry {
  const NU = 72;
  const NV = 20;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (const side of [0, 1]) {
    const base = positions.length / 3;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      const oh = openHalf(u, sp);
      for (let j = 0; j <= NV; j++) {
        const t = j / NV;
        // side 0: v from 0 up to the opening; side 1: from the opening to pi
        const v = side === 0 ? t * (Math.PI / 2 - oh) : Math.PI / 2 + oh + t * (Math.PI / 2 - oh);
        const p = upperPoint(u, v, sp);
        positions.push(p.x, p.y, p.z);
        uvs.push(u * 3, (v / Math.PI) * 2);
      }
    }
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NV; j++) {
        const a = base + i * (NV + 1) + j;
        const b = a + NV + 1;
        index.push(a, a + 1, b, b, a + 1, b + 1); // outward-facing
      }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Rolled trim around the foot opening. */
function collarCurve(sp: ShoeSpec): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const steps = 40;
  const end = sp.collarU;
  for (let k = 0; k <= steps; k++) {
    const u = 0.004 + (end - 0.004) * (k / steps);
    pts.push(upperPoint(u, Math.PI / 2 - openHalf(u, sp), sp));
  }
  for (let k = steps; k >= 0; k--) {
    const u = 0.004 + (end - 0.004) * (k / steps);
    pts.push(upperPoint(u, Math.PI / 2 + openHalf(u, sp), sp));
  }
  return pts;
}

function tube(points: THREE.Vector3[], radius: number, mat: THREE.Material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  return mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 8), radius, 8, closed), mat);
}

export function buildShoe(p: Product): THREE.Group {
  const sp = shoeSpec(p);
  const g = new THREE.Group();
  const fab = fabricOf(p);
  const main = fabricMaterial(p.color.hex, fab, { repeat: 4 });
  const accent = fabricMaterial(shade(p.color.hex, p.color.hex.toLowerCase() > "#e0" ? -0.18 : 0.14), fab, { repeat: 4 });
  const soleMat = fabricMaterial(sp.soleColor, "rubber");
  const lining = fabricMaterial(shade(p.color.hex, -0.25), "suede", { side: THREE.BackSide });
  const zAt = (u: number) => u * sp.L - sp.L / 2;
  const topAt = (u: number) => lift(u, sp) + sp.sole + (sp.upper ? interp(sp.upper, u) : 0);

  g.add(mesh(soleGeometry(sp), soleMat));

  if (sp.upper) {
    const up = upperGeometry(sp);
    g.add(mesh(up, main));
    g.add(mesh(up, lining, false)); // inside of the shoe
    if (sp.shaft === 0) g.add(tube(collarCurve(sp), sp.kind === "sneaker" ? 0.006 : 0.0035, sp.kind === "sneaker" ? accent : main, true));
  }

  // Heels
  if (sp.heelType === "stiletto" || sp.heelType === "block") {
    const h = lift(0.08, sp) + 0.002;
    const geo =
      sp.heelType === "stiletto" ? new THREE.CylinderGeometry(0.012, 0.0045, h, 16) : new THREE.CylinderGeometry(0.02, 0.016, h, 16);
    if (sp.heelType === "block") geo.scale(1.2, 1, 1);
    const heel = mesh(geo, sp.kind === "pump" ? main : soleMat);
    heel.position.set(0, h / 2, zAt(0.07));
    heel.rotation.x = sp.heelType === "stiletto" ? -0.1 : 0;
    g.add(heel);
  } else if (sp.heelType === "stacked") {
    const heel = mesh(new THREE.BoxGeometry(halfWidth(0.12, sp) * 1.8, sp.heel, 0.07), soleMat);
    heel.position.set(0, sp.heel / 2, zAt(0.11));
    g.add(heel);
  }

  // Boot shaft
  if (sp.shaft > 0) {
    const u = 0.2;
    const rx = halfWidth(u, sp) * 1.12;
    const rz = rx * 1.15;
    const geo = new THREE.CylinderGeometry(0.9, 1, sp.shaft + 0.04, 32, 4, true);
    geo.scale(rx, 1, rz);
    const shaft = mesh(geo, main);
    const y = lift(u, sp) + sp.sole + 0.025 + (sp.shaft + 0.04) / 2;
    shaft.position.set(0, y, zAt(u));
    shaft.rotation.x = -0.06;
    g.add(shaft);
    const inner = mesh(geo, lining, false);
    inner.position.copy(shaft.position);
    inner.rotation.copy(shaft.rotation);
    g.add(inner);
    if (p.subtype === "chelsea-boot") {
      for (const sx of [-1, 1]) {
        const gusset = mesh(new THREE.PlaneGeometry(0.035, sp.shaft * 0.95), fabricMaterial("#1b1b1b", "knit", { side: THREE.DoubleSide }));
        gusset.position.set(sx * (rx + 0.0015), y - 0.01, zAt(u));
        gusset.rotation.y = (sx * Math.PI) / 2;
        g.add(gusset);
      }
      const tab = mesh(new THREE.BoxGeometry(0.02, 0.035, 0.004), accent);
      tab.position.set(0, y + sp.shaft / 2 + 0.012, zAt(u) - 0.052);
      g.add(tab);
    }
    if (p.subtype === "combat-boot" || p.subtype === "hiking-boot") {
      const laceMat = fabricMaterial(p.subtype === "hiking-boot" ? "#b0412e" : "#151515", "cotton");
      // Laces up the front of the shaft, on its surface.
      for (let k = 0; k < 7; k++) {
        const t = k / 6;
        const yy = lift(u, sp) + sp.sole + 0.05 + t * (sp.shaft - 0.01);
        const zf = zAt(u) + rz * 0.98 - t * 0.004;
        g.add(tube([new THREE.Vector3(-rx * 0.35, yy, zf - 0.006), new THREE.Vector3(0, yy + 0.004, zf + 0.002), new THREE.Vector3(rx * 0.35, yy, zf - 0.006)], 0.0018, laceMat));
      }
    }
  }

  // Sneaker details: laces, toe cap, heel tab, side stripe
  if (sp.kind === "sneaker") {
    const laceMat = fabricMaterial(p.color.name.includes("white") ? "#f8f8f6" : shade(p.color.hex, 0.35), "cotton");
    for (let k = 0; k < 5; k++) {
      const u = 0.42 + k * 0.06;
      const y = topAt(u);
      const w = halfWidth(u, sp) * 0.42;
      g.add(tube([new THREE.Vector3(-w, y - 0.003, zAt(u)), new THREE.Vector3(0, y + 0.0015, zAt(u) + 0.004), new THREE.Vector3(w, y - 0.003, zAt(u))], 0.0022, laceMat));
    }
    // side stripe
    const stripeMat = fabricMaterial(p.subtype === "running-shoe" ? "#d7ff3a" : accent instanceof THREE.MeshStandardMaterial ? `#${accent.color.getHexString()}` : "#888", "leather");
    for (const sx of [-1, 1]) {
      const pts = [0.25, 0.4, 0.55, 0.68].map((u, i) => new THREE.Vector3(sx * (halfWidth(u, sp) + 0.0015), lift(u, sp) + sp.sole + 0.018 + i * 0.008, zAt(u)));
      g.add(tube(pts, 0.004, stripeMat));
    }
  }

  // Loafer strap / oxford lace panel / pump details
  if (p.subtype === "loafer") {
    const u = 0.58;
    const w = halfWidth(u, sp);
    const y = topAt(u);
    g.add(tube([new THREE.Vector3(-w, y - 0.025, zAt(u)), new THREE.Vector3(-w * 0.6, y - 0.002, zAt(u)), new THREE.Vector3(w * 0.6, y - 0.002, zAt(u)), new THREE.Vector3(w, y - 0.025, zAt(u))], 0.004, accent));
    // apron seam
    const seam: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * Math.PI;
      seam.push(new THREE.Vector3(Math.cos(a) * w * 0.7, topAt(0.75) + 0.001 - (1 - Math.sin(a)) * 0.015, zAt(0.72 + Math.sin(a) * 0.1)));
    }
    g.add(tube(seam, 0.0012, accent));
  }
  if (p.subtype === "oxford" || p.subtype === "derby") {
    const laceMat = fabricMaterial("#1a1a1a", "cotton");
    for (let k = 0; k < 4; k++) {
      const u = 0.44 + k * 0.05;
      const y = topAt(u) + 0.001;
      g.add(tube([new THREE.Vector3(-0.012, y, zAt(u)), new THREE.Vector3(0.012, y, zAt(u))], 0.0016, laceMat));
    }
    const cap: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * Math.PI;
      const u = 0.8;
      cap.push(new THREE.Vector3(Math.cos(a) * halfWidth(u, sp) * 1.02, lift(u, sp) + sp.sole + Math.sin(a) * interp(sp.upper!, u) * 1.02, zAt(u)));
    }
    g.add(tube(cap, 0.0012, accent));
  }
  if (p.subtype === "stiletto") {
    // crisscross straps over the instep
    for (const sx of [-1, 1]) {
      g.add(
        tube(
          [
            new THREE.Vector3(sx * halfWidth(0.3, sp), lift(0.3, sp) + sp.sole + 0.005, zAt(0.3)),
            new THREE.Vector3(0, topAt(0.42) + 0.035, zAt(0.43)),
            new THREE.Vector3(-sx * halfWidth(0.55, sp), lift(0.55, sp) + sp.sole + 0.01, zAt(0.56)),
          ],
          0.0035,
          main,
        ),
      );
    }
  }

  // Sandal straps / slide band
  if (sp.kind === "sandal") {
    for (const u of [0.86, 0.72]) {
      const w = halfWidth(u, sp);
      const y0 = lift(u, sp) + sp.sole;
      g.add(tube([new THREE.Vector3(-w, y0, zAt(u)), new THREE.Vector3(-w * 0.5, y0 + 0.025, zAt(u)), new THREE.Vector3(w * 0.5, y0 + 0.025, zAt(u)), new THREE.Vector3(w, y0, zAt(u))], 0.004, main));
    }
    // ankle strap
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      ring.push(new THREE.Vector3(Math.cos(a) * 0.04, lift(0.1, sp) + 0.075, zAt(0.14) + Math.sin(a) * 0.035));
    }
    g.add(tube(ring, 0.0035, main, true));
    g.add(tube([new THREE.Vector3(0, lift(0.05, sp) + sp.sole, zAt(0.02)), new THREE.Vector3(0, lift(0.08, sp) + 0.05, zAt(0.06)), new THREE.Vector3(0, lift(0.1, sp) + 0.075, zAt(0.105))], 0.004, main));
  }
  if (sp.kind === "slide") {
    // One wide band over the forefoot: a half cylinder squashed to the foot's width.
    const u = 0.62;
    const band = mesh(new THREE.CylinderGeometry(1, 1, 0.09, 32, 1, true, -Math.PI / 2, Math.PI), fabricMaterial(p.color.hex, "leather", { side: THREE.DoubleSide }));
    band.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    band.scale.set(halfWidth(u, sp) * 1.05, 1, 0.045);
    band.position.set(0, sp.sole + 0.004, zAt(u));
    g.add(band);
  }
  return g;
}

/* ================================================================== */
/* Garments (hanging / flat-lay)                                       */
/* ================================================================== */

type GarmentKind = "tee" | "longsleeve" | "tank" | "jacket" | "coat" | "dress" | "pants" | "shorts" | "skirt";

function garmentKind(p: Product): GarmentKind {
  const s = p.subtype;
  if (p.role === "outerwear") return /coat|trench/.test(s) ? "coat" : "jacket";
  if (p.role === "dress") return "dress";
  if (p.role === "bottom") return /skirt/.test(s) ? "skirt" : /short/.test(s) ? "shorts" : "pants";
  if (/tank|camisole/.test(s)) return "tank";
  if (/tee|polo/.test(s)) return "tee";
  return "longsleeve";
}

/** Sewing-pattern silhouette, front view, y=0 at the shoulder line (meters), centered on x. */
function garmentShape(p: Product): { shape: THREE.Shape; height: number; shoulder: number } {
  const k = garmentKind(p);
  const s = p.subtype;
  const sh = new THREE.Shape();
  const M = (x: number, y: number) => sh.moveTo(x, -y);
  const Lto = (x: number, y: number) => sh.lineTo(x, -y);
  const Q = (cx: number, cy: number, x: number, y: number) => sh.quadraticCurveTo(cx, -cy, x, -y);

  switch (k) {
    case "tee":
    case "longsleeve":
    case "tank":
    case "jacket":
    case "coat": {
      const outer = k === "jacket" || k === "coat";
      const bw = outer ? 0.25 : 0.22; // half chest
      const len = k === "coat" ? (s === "trench-coat" ? 1.0 : 0.95) : outer ? 0.66 : s === "hoodie" ? 0.64 : 0.6;
      const neck = k === "tank" ? 0.1 : 0.075;
      const sleeve = k === "tank" ? 0 : k === "tee" ? 0.2 : 0.6;
      const hem = bw * (k === "coat" ? 1.08 : s === "hoodie" ? 0.92 : 1);
      M(-neck, 0);
      Q(0, k === "tank" ? 0.16 : 0.09, neck, 0); // neckline
      if (k === "tank") {
        Lto(neck + 0.025, 0);
        Q(bw, 0.12, bw, 0.22);
      } else {
        Lto(bw - 0.01, 0.025); // shoulder slope
        // sleeve: angled outward and down
        const ang = k === "tee" ? 0.75 : 0.32;
        const sx = Math.sin(ang) * sleeve;
        const sy = Math.cos(ang) * sleeve;
        const cuff = k === "tee" ? 0.075 : 0.055;
        Lto(bw - 0.01 + sx, 0.025 + sy);
        Lto(bw - 0.01 + sx - cuff * Math.cos(ang), 0.025 + sy + cuff * Math.sin(ang));
        Lto(bw, 0.2); // underarm
      }
      Q(bw - 0.02, len * 0.6, hem, len); // side seam with slight waist
      Q(0, len + 0.012, -hem, len); // hem
      Q(-bw + 0.02, len * 0.6, -bw, k === "tank" ? 0.22 : 0.2);
      if (k === "tank") {
        Q(-bw, 0.12, -neck - 0.025, 0);
      } else {
        const ang = k === "tee" ? 0.75 : 0.32;
        const sx = Math.sin(ang) * sleeve;
        const sy = Math.cos(ang) * sleeve;
        const cuff = k === "tee" ? 0.075 : 0.055;
        Lto(-(bw - 0.01 + sx - cuff * Math.cos(ang)), 0.025 + sy + cuff * Math.sin(ang));
        Lto(-(bw - 0.01 + sx), 0.025 + sy);
        Lto(-(bw - 0.01), 0.025);
      }
      Lto(-neck, 0);
      return { shape: sh, height: len, shoulder: bw };
    }
    case "dress": {
      const len = s === "maxi-dress" ? 1.35 : s === "cocktail-dress" ? 0.92 : s === "knit-midi-dress" ? 1.15 : 1.05;
      const hemW = s === "cocktail-dress" ? 0.27 : s === "slip-dress" ? 0.3 : 0.36;
      const straps = s === "slip-dress" || s === "sundress" || s === "maxi-dress";
      const bw = 0.19;
      if (straps) {
        M(-0.1, 0);
        Lto(-0.085, 0);
        Lto(-0.07, 0.14);
        Q(0, 0.2, 0.07, 0.14);
        Lto(0.085, 0);
        Lto(0.1, 0);
        Q(bw, 0.12, bw, 0.2);
      } else {
        M(-0.075, 0);
        Q(0, 0.09, 0.075, 0);
        Lto(bw - 0.01, 0.025);
        const sleeve = s === "knit-midi-dress" ? 0.58 : 0.18;
        const ang = s === "knit-midi-dress" ? 0.3 : 0.75;
        Lto(bw - 0.01 + Math.sin(ang) * sleeve, 0.025 + Math.cos(ang) * sleeve);
        Lto(bw - 0.01 + Math.sin(ang) * sleeve - 0.05 * Math.cos(ang), 0.025 + Math.cos(ang) * sleeve + 0.05 * Math.sin(ang));
        Lto(bw, 0.2);
      }
      Q(0.15, 0.36, 0.16, 0.42); // waist
      Q(hemW * 0.85, len * 0.7, hemW, len);
      Q(0, len + 0.03, -hemW, len);
      Q(-hemW * 0.85, len * 0.7, -0.16, 0.42);
      Q(-0.15, 0.36, -bw, 0.2);
      if (straps) {
        Q(-bw, 0.12, -0.1, 0);
      } else {
        const sleeve = s === "knit-midi-dress" ? 0.58 : 0.18;
        const ang = s === "knit-midi-dress" ? 0.3 : 0.75;
        Lto(-(bw - 0.01 + Math.sin(ang) * sleeve - 0.05 * Math.cos(ang)), 0.025 + Math.cos(ang) * sleeve + 0.05 * Math.sin(ang));
        Lto(-(bw - 0.01 + Math.sin(ang) * sleeve), 0.025 + Math.cos(ang) * sleeve);
        Lto(-(bw - 0.01), 0.025);
        Lto(-0.075, 0);
      }
      return { shape: sh, height: len, shoulder: bw };
    }
    case "pants":
    case "shorts": {
      const waist = 0.19;
      const legLen = k === "shorts" ? 0.3 : s === "legging" ? 0.96 : 1.0;
      const hemHalf = s === "wide-leg-trouser" ? 0.14 : s === "jogger" || s === "legging" ? 0.055 : s === "straight-jean" || s === "chino" || s === "cargo-pant" ? 0.09 : 0.08;
      const hip = 0.215;
      const crotch = k === "shorts" ? 0.24 : 0.3;
      M(-waist, 0);
      Lto(waist, 0);
      Q(hip + 0.005, 0.12, hip, crotch * 0.8);
      Lto(Math.max(hemHalf * 2 + 0.01, hip * 0.98), legLen);
      // Inner leg seams: keep a clear gap between the legs (wider than the bevel).
      const gap = s === "wide-leg-trouser" ? 0.03 : 0.04;
      Lto(gap, legLen);
      Q(gap * 0.6, crotch + 0.06, 0, crotch);
      Q(-gap * 0.6, crotch + 0.06, -gap, legLen);
      Lto(-Math.max(hemHalf * 2 + 0.01, hip * 0.98), legLen);
      Lto(-hip, crotch * 0.8);
      Q(-hip - 0.005, 0.12, -waist, 0);
      return { shape: sh, height: legLen, shoulder: waist };
    }
    case "skirt": {
      const len = s === "mini-skirt" ? 0.4 : 0.72;
      const hemW = s === "mini-skirt" ? 0.26 : 0.34;
      M(-0.18, 0);
      Lto(0.18, 0);
      Q(0.21, 0.1, hemW, len);
      Q(0, len + 0.02, -hemW, len);
      Q(-0.21, 0.1, -0.18, 0);
      return { shape: sh, height: len, shoulder: 0.18 };
    }
  }
}

export function buildGarment(p: Product, opts: { hanger?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  const { shape, height } = garmentShape(p);
  const k = garmentKind(p);
  const fab = fabricOf(p);
  const puffy = /puffer/.test(p.subtype);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: puffy ? 0.05 : 0.02,
    bevelEnabled: true,
    bevelThickness: puffy ? 0.03 : 0.014,
    bevelSize: puffy ? 0.02 : 0.012,
    bevelSegments: 4,
    curveSegments: 14,
  });
  geo.translate(0, 0, -0.01);
  const mat = fabricMaterial(p.color.hex, fab, { repeat: fab === "denim" ? 14 : fab === "knit" ? 18 : 10 });
  const top = opts.hanger === false ? 0 : -0.1;
  const body = mesh(geo, mat);
  body.position.y = top;
  g.add(body);
  const zf = 0.026 + (puffy ? 0.03 : 0); // front surface
  const detail = (o: THREE.Object3D) => {
    o.position.y += top;
    g.add(o);
  };
  const darker = fabricMaterial(shade(p.color.hex, -0.15), fab, { repeat: 10 });
  const stitch = fabricMaterial(/denim|jean/.test(p.subtype + p.color.name) ? "#c98a3a" : shade(p.color.hex, -0.25), "cotton");

  // Front opening / placket / buttons
  if (k === "jacket" || k === "coat" || /oxford-shirt|shirt-dress|cardigan|linen-shirt/.test(p.subtype)) {
    const line = mesh(new THREE.BoxGeometry(0.006, height * 0.97, 0.004), darker);
    line.position.set(0, -height / 2 - 0.05, zf);
    detail(line);
    if (!/bomber|puffer|fleece|leather-jacket/.test(p.subtype)) {
      const btn = fabricMaterial(/jacket|coat|blazer|trench/.test(p.subtype) ? "#2b2622" : "#efece6", "satin");
      const n = k === "coat" ? 6 : 5;
      for (let i = 0; i < n; i++) {
        const b = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.005, 14), btn);
        b.rotation.x = Math.PI / 2;
        b.position.set(0.018, -0.14 - i * (height * 0.7) / n, zf + 0.004);
        detail(b);
      }
    } else {
      const zip = mesh(new THREE.BoxGeometry(0.008, height * 0.95, 0.006), fabricMaterial("#b9b5ad", "metal"));
      zip.position.set(0, -height / 2 - 0.05, zf + 0.002);
      detail(zip);
    }
  }
  // Pointed collar for shirts, polos and shirt dresses
  if (/oxford-shirt|linen-shirt|polo|shirt-dress/.test(p.subtype)) {
    for (const sx of [-1, 1]) {
      const col = new THREE.Shape();
      col.moveTo(0, 0);
      col.lineTo(sx * 0.075, 0.005);
      col.lineTo(sx * 0.05, -0.075);
      col.lineTo(0, -0.03);
      col.lineTo(0, 0);
      const cm = mesh(new THREE.ExtrudeGeometry(col, { depth: 0.004, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 2 }), mat);
      cm.position.set(sx * 0.004, 0.004, zf);
      detail(cm);
    }
  }
  // Lapels for tailoring
  if (/blazer|trench|wool-coat/.test(p.subtype)) {
    for (const sx of [-1, 1]) {
      const lap = new THREE.Shape();
      lap.moveTo(0, 0);
      lap.lineTo(sx * 0.085, -0.02);
      lap.lineTo(sx * 0.11, -0.12);
      lap.lineTo(sx * 0.005, -0.32);
      lap.lineTo(0, 0);
      const lm = mesh(new THREE.ExtrudeGeometry(lap, { depth: 0.006, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 }), darker);
      lm.position.set(sx * 0.07, 0, zf - 0.002);
      detail(lm);
    }
  }
  // Puffer quilting
  if (puffy) {
    for (let i = 1; i < 6; i++) {
      const r = mesh(new THREE.BoxGeometry(0.48, 0.006, 0.01), darker);
      r.position.set(0, -i * (height / 6), zf + 0.01);
      detail(r);
    }
  }
  // Hood
  if (p.subtype === "hoodie") {
    const hood = mesh(new THREE.SphereGeometry(0.12, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    hood.scale.set(1, 0.7, 0.35);
    hood.position.set(0, 0.0, -0.02);
    detail(hood);
    const pocket = mesh(new THREE.BoxGeometry(0.26, 0.12, 0.006), darker);
    pocket.position.set(0, -height + 0.12, zf);
    detail(pocket);
  }
  // Jeans: waistband, fly stitch, pockets
  if (k === "pants" || k === "shorts") {
    const band = mesh(new THREE.BoxGeometry(0.38, 0.04, 0.008), darker);
    band.position.set(0, -0.02, zf);
    detail(band);
    if (/jean|cargo|chino/.test(p.subtype)) {
      for (const sx of [-1, 1]) {
        const pk: THREE.Vector3[] = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          pk.push(new THREE.Vector3(sx * (0.12 + 0.06 * Math.sin(t * Math.PI * 0.5)), -0.05 - 0.07 * Math.sin(t * Math.PI * 0.5), zf + 0.002));
        }
        const tb = tube(pk, 0.0016, stitch);
        detail(tb);
      }
      const fly = tube([new THREE.Vector3(0.025, -0.05, zf + 0.002), new THREE.Vector3(0.025, -0.2, zf + 0.002), new THREE.Vector3(0.0, -0.24, zf + 0.002)], 0.0015, stitch);
      detail(fly);
    }
    if (p.subtype === "cargo-pant") {
      for (const sx of [-1, 1]) {
        const cp = mesh(new THREE.BoxGeometry(0.11, 0.14, 0.012), darker);
        cp.position.set(sx * 0.15, -0.55, zf + 0.004);
        detail(cp);
      }
    }
  }
  // Slip/cocktail sheen is in the material; denim jacket gets chest pockets
  if (p.subtype === "denim-jacket") {
    for (const sx of [-1, 1]) {
      const cp = mesh(new THREE.BoxGeometry(0.09, 0.08, 0.008), darker);
      cp.position.set(sx * 0.11, -0.17, zf + 0.002);
      detail(cp);
    }
  }

  if (opts.hanger !== false) {
    const wood = fabricMaterial("#8a6a48", "leather");
    const hook = mesh(new THREE.TorusGeometry(0.025, 0.004, 8, 16, Math.PI * 1.4), fabricMaterial("#a8a29e", "metal"));
    hook.position.y = -0.03;
    hook.rotation.z = -0.3;
    g.add(hook);
    const bar = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.21, -0.11, 0), new THREE.Vector3(0, -0.06, 0), new THREE.Vector3(0.21, -0.11, 0)]);
    g.add(mesh(new THREE.TubeGeometry(bar, 20, 0.008, 8), wood));
  }
  return g;
}

/* ================================================================== */
/* Bags + accessories                                                  */
/* ================================================================== */

export function buildBag(p: Product): THREE.Group {
  const g = new THREE.Group();
  const s = p.subtype;
  const fab = fabricOf(p);
  const mat = fabricMaterial(p.color.hex, fab, { repeat: 4 });
  const trim = fabricMaterial(shade(p.color.hex, fab === "canvas" ? -0.25 : -0.07), fab === "canvas" ? "leather" : fab, { repeat: 4 });
  const hw = fabricMaterial("#c9b27c", "metal");
  const dims: Record<string, [number, number, number]> = {
    tote: [0.38, 0.32, 0.13],
    crossbody: [0.23, 0.16, 0.07],
    clutch: [0.27, 0.13, 0.035],
    backpack: [0.3, 0.42, 0.15],
    "belt-bag": [0.27, 0.13, 0.07],
  };
  const [w, h, d] = dims[s] ?? [0.28, 0.22, 0.1];
  // Body: trapezoid profile extruded (wider at the base) for a soft structured bag.
  const prof = new THREE.Shape();
  const top = s === "tote" ? w * 0.92 : w;
  prof.moveTo(-w / 2, 0);
  prof.lineTo(w / 2, 0);
  prof.quadraticCurveTo(w / 2 + 0.005, h * 0.5, top / 2, h);
  prof.lineTo(-top / 2, h);
  prof.quadraticCurveTo(-w / 2 - 0.005, h * 0.5, -w / 2, 0);
  const geo = new THREE.ExtrudeGeometry(prof, { depth: d - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 4 });
  geo.translate(0, 0, -(d - 0.02) / 2);
  g.add(mesh(geo, mat));
  const front = d / 2 + 0.002;
  if (s === "tote") {
    for (const x of [-0.08, 0.08]) {
      const handle = new THREE.CatmullRomCurve3([new THREE.Vector3(x - 0.04, h, 0.03), new THREE.Vector3(x, h + 0.13, 0), new THREE.Vector3(x + 0.04, h, -0.03)]);
      g.add(mesh(new THREE.TubeGeometry(handle, 20, 0.008, 8), trim));
    }
  } else if (s === "backpack") {
    const pocket = mesh(new THREE.BoxGeometry(w * 0.7, h * 0.35, 0.05), mat);
    pocket.position.set(0, h * 0.25, front);
    g.add(pocket);
    const loop = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.03, h + 0.005, 0), new THREE.Vector3(0, h + 0.05, 0), new THREE.Vector3(0.03, h + 0.005, 0)]);
    g.add(mesh(new THREE.TubeGeometry(loop, 12, 0.006, 6), trim));
  } else {
    // flap + clasp
    const flap = mesh(new THREE.BoxGeometry(w * 0.98, h * 0.5, 0.008), trim);
    flap.position.set(0, h * 0.74, front);
    g.add(flap);
    const clasp = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.006, 16), hw);
    clasp.rotation.x = Math.PI / 2;
    clasp.position.set(0, h * 0.5, front + 0.006);
    g.add(clasp);
    if (s === "crossbody" || s === "belt-bag") {
      const strap = new THREE.CatmullRomCurve3([new THREE.Vector3(-w / 2, h * 0.9, 0), new THREE.Vector3(-w / 2 - 0.05, h + 0.25, 0), new THREE.Vector3(0, h + 0.38, 0), new THREE.Vector3(w / 2 + 0.05, h + 0.25, 0), new THREE.Vector3(w / 2, h * 0.9, 0)]);
      g.add(mesh(new THREE.TubeGeometry(strap, 40, 0.005, 6), trim));
    }
  }
  return g;
}

export function buildAccessory(p: Product): THREE.Group {
  const g = new THREE.Group();
  const s = p.subtype;
  const fab = fabricOf(p);
  const mat = fabricMaterial(p.color.hex, fab, { repeat: 6 });
  switch (s) {
    case "socks":
      for (const x of [-0.05, 0.05]) {
        const leg = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.2, -0.03), new THREE.Vector3(x, 0.06, -0.03), new THREE.Vector3(x, 0.025, 0.02), new THREE.Vector3(x, 0.025, 0.13)]);
        g.add(mesh(new THREE.TubeGeometry(leg, 30, 0.028, 14), mat));
        const cuff = mesh(new THREE.TorusGeometry(0.028, 0.006, 8, 20), fabricMaterial(shade(p.color.hex, 0.2), "knit"));
        cuff.rotation.x = Math.PI / 2;
        cuff.position.set(x, 0.2, -0.03);
        g.add(cuff);
      }
      break;
    case "belt": {
      const coil = new THREE.Group();
      coil.add(mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 40), mat));
      coil.children[0].scale.set(1, 1, 0.3);
      const buckle = mesh(new THREE.TorusGeometry(0.022, 0.004, 8, 4), fabricMaterial("#c9b27c", "metal"));
      buckle.position.set(0.1, 0, 0);
      buckle.rotation.y = Math.PI / 2;
      coil.add(buckle);
      coil.rotation.x = -Math.PI / 2;
      coil.position.y = 0.012;
      g.add(coil);
      break;
    }
    case "scarf": {
      const geo = new THREE.BoxGeometry(0.3, 0.06, 0.2, 12, 2, 8);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + 0.012 * Math.sin(pos.getX(i) * 40));
      geo.computeVertexNormals();
      const m = mesh(geo, mat);
      m.position.y = 0.035;
      g.add(m);
      break;
    }
    case "beanie":
    case "cap":
    case "sun-hat": {
      const crown = mesh(new THREE.SphereGeometry(0.1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      crown.scale.y = s === "beanie" ? 1.1 : 0.8;
      g.add(crown);
      if (s === "beanie") {
        const cuff = mesh(new THREE.CylinderGeometry(0.102, 0.104, 0.04, 28, 1, true), mat);
        cuff.position.y = 0.02;
        g.add(cuff);
      } else {
        const brim = mesh(new THREE.CylinderGeometry(s === "cap" ? 0.11 : 0.22, s === "cap" ? 0.11 : 0.22, 0.006, 40), mat);
        if (s === "cap") {
          brim.scale.set(0.85, 1, 0.65);
          brim.position.z = 0.08;
        }
        g.add(brim);
      }
      break;
    }
    case "sunglasses": {
      const frame = fabricMaterial(p.color.hex, "leather");
      const lens = new THREE.MeshPhysicalMaterial({ color: "#1d1d1d", roughness: 0.05, transmission: 0.2, metalness: 0.2 });
      for (const x of [-0.035, 0.035]) {
        const l = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.004, 24), lens);
        l.rotation.x = Math.PI / 2;
        l.position.set(x, 0.03, 0);
        g.add(l);
        const rim = mesh(new THREE.TorusGeometry(0.027, 0.003, 8, 24), frame);
        rim.position.set(x, 0.03, 0);
        g.add(rim);
      }
      const bridge = mesh(new THREE.BoxGeometry(0.02, 0.004, 0.004), frame);
      bridge.position.set(0, 0.035, 0);
      g.add(bridge);
      break;
    }
    case "watch": {
      const strap = mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 28), mat);
      strap.scale.set(1, 1.2, 1);
      strap.position.y = 0.045;
      g.add(strap);
      const face = mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.01, 28), fabricMaterial("#f2f2f0", "satin"));
      face.rotation.x = Math.PI / 2;
      face.position.set(0, 0.045, 0.04);
      g.add(face);
      break;
    }
    default: {
      // necklace
      const chain = mesh(new THREE.TorusGeometry(0.08, 0.003, 6, 48), mat);
      chain.rotation.x = -Math.PI / 2;
      chain.position.y = 0.004;
      g.add(chain);
      const pendant = mesh(new THREE.SphereGeometry(0.012, 16, 12), mat);
      pendant.position.set(0, 0.008, 0.08);
      g.add(pendant);
    }
  }
  return g;
}

/* ================================================================== */
/* Loading real models (GLB / FBX)                                     */
/* ================================================================== */

const fileCache = new Map<string, Promise<THREE.Object3D>>();

/** Loads a real asset and normalizes it to `size` meters along its longest axis, resting on y=0, toe/front toward +z. */
function loadModel(url: string, size: number, textureUrl?: string): Promise<THREE.Object3D> {
  const key = `${url}|${size}`;
  let hit = fileCache.get(key);
  if (!hit) {
    hit = (async () => {
      let obj: THREE.Object3D;
      if (url.toLowerCase().endsWith(".fbx")) {
        const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
        const manager = new THREE.LoadingManager();
        // The FBX names its original 6.7 MB PNG; serve our compressed copy instead.
        if (textureUrl) manager.setURLModifier((u) => (/\.(png|jpe?g)$/i.test(u) ? textureUrl : u));
        obj = await new FBXLoader(manager).loadAsync(url);
      } else {
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        obj = (await new GLTFLoader().loadAsync(url)).scene;
      }
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) if ((mat as THREE.MeshStandardMaterial).map) (mat as THREE.MeshStandardMaterial).map!.colorSpace = THREE.SRGBColorSpace;
        }
      });
      const box = new THREE.Box3().setFromObject(obj);
      const dims = box.getSize(new THREE.Vector3());
      const k = size / Math.max(dims.x, dims.y, dims.z, 1e-6);
      obj.scale.multiplyScalar(k);
      const b2 = new THREE.Box3().setFromObject(obj);
      const c = b2.getCenter(new THREE.Vector3());
      obj.position.sub(new THREE.Vector3(c.x, b2.min.y, c.z));
      const wrap = new THREE.Group();
      wrap.add(obj);
      return wrap;
    })();
    fileCache.set(key, hit);
  }
  return hit.then((o) => o.clone(true));
}

/* ================================================================== */
/* Entry points                                                        */
/* ================================================================== */

export function buildProcedural(p: Product, opts: { hanger?: boolean } = {}): THREE.Group {
  if (p.role === "shoes") return buildShoe(p);
  if (p.role === "bag") return buildBag(p);
  if (p.role === "accessory") return buildAccessory(p);
  return buildGarment(p, opts);
}

/** Real model when the product has one, procedural otherwise. Shoes face +z (toe forward). */
export async function buildProduct(p: Product, opts: { hanger?: boolean } = {}): Promise<THREE.Object3D> {
  if (p.model_url) {
    try {
      const size = p.role === "shoes" ? 0.27 : p.role === "bag" ? 0.38 : 0.9;
      const obj = await loadModel(p.model_url, size, p.model_texture_url);
      if (p.model_rotation_y) obj.rotation.y = p.model_rotation_y;
      return obj;
    } catch (err) {
      console.warn(`[models] ${p.model_url} failed, using procedural`, err);
    }
  }
  return buildProcedural(p, opts);
}

export { garmentKind, garmentShape };
