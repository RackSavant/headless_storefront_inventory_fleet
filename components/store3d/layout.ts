/**
 * Floor plan. The store is a 3x2 grid of section slots plus an entrance strip.
 * The fitting room / mix & match stage is fixed at the back center; every role
 * you stock gets its own section; the categories you don't stock become
 * "Partner Picks" sections stocked from the external catalog.
 */
import type { Product, Role } from "@/lib/types";

export type V3 = [number, number, number];
export type FixtureKind = "shelves" | "tables" | "case" | "racks" | "fitting";

export interface PlacedItem {
  product: Product;
  position: V3;
  rotationY: number;
  scale: number;
}

export interface Section {
  id: string;
  name: string;
  subtitle: string;
  kind: FixtureKind;
  partner: boolean;
  roles: Role[];
  center: [number, number];
  size: [number, number];
  tint: string;
  items: PlacedItem[];
  products: Product[];
  camera: { position: V3; target: V3 };
}

export const FLOOR = { w: 24.4, d: 13.6 };
export const MAP_CAMERA = { position: [0, 21, 6.5] as V3, target: [0, 0, 0.2] as V3 };

const SLOT_W = 5.6;
const SLOT_D = 4.6;
// Back row then front row. B (back center) is reserved for the fitting room.
const SLOTS: Record<string, [number, number]> = {
  A: [-9, -4],
  B: [-3, -4],
  C: [3, -4],
  D: [-9, 1.2],
  E: [-3, 1.2],
  F: [3, 1.2],
  G: [9, -4],
  H: [9, 1.2],
};
const SLOT_ORDER = ["A", "D", "E", "F", "C", "G", "H"];

const ROLE_INFO: Record<Role, { name: string; kind: FixtureKind; tint: string }> = {
  shoes: { name: "Shoe Wall", kind: "shelves", tint: "#e9dcc9" },
  bag: { name: "Bags", kind: "tables", tint: "#e3d6cf" },
  accessory: { name: "Accessories", kind: "case", tint: "#dfe0d3" },
  top: { name: "Tops", kind: "racks", tint: "#dbe2e6" },
  bottom: { name: "Bottoms", kind: "racks", tint: "#e2dde8" },
  dress: { name: "Dresses", kind: "racks", tint: "#ecdcdc" },
  outerwear: { name: "Outerwear", kind: "racks", tint: "#dde3d8" },
};

const WEARABLE_ORDER: Role[] = ["shoes", "top", "bottom", "dress", "outerwear", "bag", "accessory"];

function cameraFor(kind: FixtureKind, cx: number, cz: number): Section["camera"] {
  if (kind === "fitting") return { position: [cx, 1.5, cz + 3.1], target: [cx, 0.95, cz] };
  return { position: [cx, 1.9, cz + 4.4], target: [cx, 1.0, cz - 0.7] };
}

function placeShelves(products: Product[], cx: number, cz: number): PlacedItem[] {
  const rows = [0.32, 0.77, 1.22, 1.67, 2.12];
  // Spread across every shelf so a small range still fills the wall.
  const perRow = Math.min(8, Math.max(3, Math.ceil(products.length / rows.length)));
  const gap = 4.8 / perRow;
  const scale = perRow <= 4 ? 1.7 : 1.35;
  return products.slice(0, rows.length * perRow).map((product, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = cx - ((perRow - 1) * gap) / 2 + col * gap;
    return { product, position: [x, rows[row], cz - 1.85], rotationY: 0.55, scale };
  });
}

function placeTables(products: Product[], cx: number, cz: number): PlacedItem[] {
  const spots: V3[] = [];
  for (const tx of [-1.35, 1.35]) for (const row of [-0.22, 0.22]) for (const col of [-0.6, 0, 0.6]) spots.push([cx + tx + col, 0.8, cz + row - 0.2]);
  return products.slice(0, spots.length).map((product, i) => ({ product, position: spots[i], rotationY: 0.25 - (i % 3) * 0.25, scale: 1.25 }));
}

function placeCase(products: Product[], cx: number, cz: number): PlacedItem[] {
  const perRow = 6;
  return products.slice(0, perRow * 2).map((product, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    return { product, position: [cx - 1.75 + col * 0.7, 1.0, cz - 0.45 + row * 0.42], rotationY: 0, scale: 1.4 };
  });
}

/** Back rack faces the camera; two side racks angle in. Origins are hanger hooks. */
function placeRacks(products: Product[], cx: number, cz: number): PlacedItem[] {
  const out: PlacedItem[] = [];
  const back = products.slice(0, 9);
  back.forEach((product, i) => out.push({ product, position: [cx - 2.2 + i * 0.55, 1.95, cz - 1.8], rotationY: 0, scale: 1 }));
  products.slice(9, 15).forEach((product, i) => out.push({ product, position: [cx - 2.45, 1.75, cz - 1.15 + i * 0.5], rotationY: Math.PI / 2, scale: 1 }));
  products.slice(15, 21).forEach((product, i) => out.push({ product, position: [cx + 2.45, 1.75, cz - 1.15 + i * 0.5], rotationY: -Math.PI / 2, scale: 1 }));
  return out;
}

function place(kind: FixtureKind, products: Product[], cx: number, cz: number): PlacedItem[] {
  switch (kind) {
    case "shelves":
      return placeShelves(products, cx, cz);
    case "tables":
      return placeTables(products, cx, cz);
    case "case":
      return placeCase(products, cx, cz);
    case "racks":
      return placeRacks(products, cx, cz);
    default:
      return [];
  }
}

/** Show variety: one of each subtype first, then second colors, and so on. */
export function varietyOrder(products: Product[]): Product[] {
  const groups = new Map<string, Product[]>();
  for (const p of products) groups.set(p.subtype, [...(groups.get(p.subtype) ?? []), p]);
  const out: Product[] = [];
  for (let round = 0; out.length < products.length; round++) {
    for (const g of groups.values()) if (g[round]) out.push(g[round]);
  }
  return out;
}

export function buildSections(inventory: Product[], external: Product[], protectMin = 3, priority: string[] = []): Section[] {
  const stocked = new Map<Role, Product[]>();
  for (const p of inventory) if ((p.quantity ?? 0) > 0) stocked.set(p.role, [...(stocked.get(p.role) ?? []), p]);

  const sections: Section[] = [];
  const [fx, fz] = SLOTS.B;
  sections.push({
    id: "fitting",
    name: "Fitting Room",
    subtitle: "Try on · mix & match",
    kind: "fitting",
    partner: false,
    roles: [],
    center: [fx, fz],
    size: [SLOT_W, SLOT_D],
    tint: "#f1e4d6",
    items: [],
    products: [],
    camera: cameraFor("fitting", fx, fz),
  });

  const free = [...SLOT_ORDER];
  const ownRoles = WEARABLE_ORDER.filter((r) => stocked.has(r));
  for (const role of ownRoles) {
    const slot = free.shift();
    if (!slot) break;
    const [cx, cz] = SLOTS[slot];
    const info = ROLE_INFO[role];
    const pool = stocked.get(role)!;
    const items = [...pool.filter((p) => priority.includes(p.id)), ...varietyOrder(pool.filter((p) => !priority.includes(p.id)))];
    sections.push({
      id: `own-${role}`,
      name: info.name,
      subtitle: `${items.length} styles in store`,
      kind: info.kind,
      partner: false,
      roles: [role],
      center: [cx, cz],
      size: [SLOT_W, SLOT_D],
      tint: info.tint,
      items: place(info.kind, items, cx, cz),
      products: items,
      camera: cameraFor(info.kind, cx, cz),
    });
  }

  // Everything you don't carry (or carry too little of to protect) comes from partners.
  const partnerRoles = (["top", "outerwear", "bottom", "dress", "bag", "accessory", "shoes"] as Role[]).filter(
    (r) => (stocked.get(r)?.length ?? 0) < protectMin && external.some((p) => p.role === r),
  );
  const garmentRoles = partnerRoles.filter((r) => ["top", "outerwear", "bottom", "dress"].includes(r));
  const groups: Role[][] =
    free.length >= 2 && garmentRoles.length > 2
      ? [garmentRoles.filter((r) => r === "top" || r === "outerwear"), garmentRoles.filter((r) => r === "bottom" || r === "dress")]
      : garmentRoles.length
        ? [garmentRoles]
        : [];
  const prio = new Set(priority);
  for (const roles of groups.filter((g) => g.length)) {
    const slot = free.shift();
    if (!slot) break;
    const [cx, cz] = SLOTS[slot];
    const pool = external.filter((p) => roles.includes(p.role));
    const ordered = [...pool.filter((p) => prio.has(p.id)), ...varietyOrder(pool.filter((p) => !prio.has(p.id)))];
    const names = roles.map((r) => ROLE_INFO[r].name);
    sections.push({
      id: `partner-${roles.join("-")}`,
      name: `Partner Picks`,
      subtitle: names.join(" & "),
      kind: "racks",
      partner: true,
      roles,
      center: [cx, cz],
      size: [SLOT_W, SLOT_D],
      tint: "#e6e1f0",
      items: place("racks", ordered, cx, cz),
      products: ordered,
      camera: cameraFor("racks", cx, cz),
    });
  }
  return sections;
}
