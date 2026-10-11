"use client";

import { CameraControls, ContactShadows, Html, RoundedBox } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Product } from "@/lib/types";
import { FLOOR, MAP_CAMERA, type PlacedItem, type Section } from "./layout";
import { ProductModel, WornOutfit } from "./models";
import SplatBackdrop from "./SplatBackdrop";

export interface StoreSceneProps {
  sections: Section[];
  view: string; // "map" or a section id
  selectedId: string | null;
  outfit: Product[];
  onEnterSection: (id: string) => void;
  onSelectItem: (p: Product) => void;
  splatUrl?: string;
}

const WOOD = "#cdb79a";

/** Stable mount target for drei <Html>; without it each overlay remounts once on load. */
const PortalContext = createContext<React.RefObject<HTMLElement> | null>(null);
function usePortal() {
  return useContext(PortalContext) ?? undefined;
}
const WALL = "#f3eee6";

function usd(c: number) {
  return `$${Math.round(c / 100)}`;
}

/** Screen space covered by UI: header on top, then a right column (desktop) or bottom sheet (mobile). */
function panelInset(w: number, h: number) {
  return w >= 768 ? { top: 64, right: 392, bottom: 0 } : { top: 108, right: 0, bottom: Math.round(h * 0.5) };
}

function CameraRig({ sections, view }: { sections: Section[]; view: string }) {
  const ref = useRef<CameraControls>(null);
  const { camera, size } = useThree();

  // Shift the projection so the store centers in the uncovered part of the screen.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const inset = panelInset(size.width, size.height);
    cam.setViewOffset(size.width, size.height, inset.right / 2, (inset.bottom - inset.top) / 2, size.width, size.height);
    cam.updateProjectionMatrix();
  }, [camera, size]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const sec = sections.find((s) => s.id === view);
    if (sec) {
      // Keep the authored angle, but back off on narrow screens so the whole fixture fits.
      const cam = camera as THREE.PerspectiveCamera;
      const inset = panelInset(size.width, size.height);
      // The view offset shifts the frustum without shrinking it, so the uncovered
      // width is a fraction of the full-height frustum.
      const aspect = (size.width - inset.right) / size.height;
      const [px, py, pz] = sec.camera.position;
      const [tx, ty, tz] = sec.camera.target;
      const offset = new THREE.Vector3(px - tx, py - ty, pz - tz);
      const fitW = (sec.size[0] * (sec.kind === "fitting" ? 0.3 : 0.52)) / (Math.tan((cam.fov * Math.PI) / 360) * aspect);
      offset.setLength(Math.max(offset.length(), fitW));
      c.setLookAt(tx + offset.x, ty + offset.y, tz + offset.z, tx, ty, tz, true);
      c.minDistance = 1.2;
      c.maxDistance = Math.max(7, offset.length() * 1.4);
      c.minPolarAngle = 0.25;
      c.maxPolarAngle = Math.PI / 2 - 0.05;
      c.minAzimuthAngle = -Math.PI / 2.2;
      c.maxAzimuthAngle = Math.PI / 2.2;
      return;
    }
    // Map: back off along the map view direction until the whole floor fits the visible area.
    const cam = camera as THREE.PerspectiveCamera;
    const inset = panelInset(size.width, size.height);
    const aspect = (size.width - inset.right) / size.height;
    const fy = (size.height - inset.top - inset.bottom) / size.height;
    const vFov = (cam.fov * Math.PI) / 180;
    const fitH = (FLOOR.d * 0.62) / (Math.tan(vFov / 2) * fy);
    const fitW = (FLOOR.w * 0.56) / (Math.tan(vFov / 2) * aspect);
    const dist = Math.max(fitH, fitW);
    const [px, py, pz] = MAP_CAMERA.position;
    const [tx, ty, tz] = MAP_CAMERA.target;
    const dir = new THREE.Vector3(px - tx, py - ty, pz - tz).normalize().multiplyScalar(dist);
    c.minDistance = 6;
    c.maxDistance = dist * 1.6;
    c.minPolarAngle = 0;
    c.maxPolarAngle = 0.75;
    c.minAzimuthAngle = -0.6;
    c.maxAzimuthAngle = 0.6;
    c.setLookAt(tx + dir.x, ty + dir.y, tz + dir.z, tx, ty, tz, true);
  }, [sections, view, camera, size]);

  return <CameraControls ref={ref} makeDefault smoothTime={0.6} dollyToCursor />;
}

function Shell({ hideWalls }: { hideWalls: boolean }) {
  const { w, d } = FLOOR;
  const portal = usePortal();
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      {!hideWalls && (
        <>
          <mesh position={[0, 1.6, -d / 2]} receiveShadow>
            <boxGeometry args={[w, 3.2, 0.12]} />
            <meshStandardMaterial color={WALL} roughness={0.95} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[(s * w) / 2, 1.6, 0]} receiveShadow>
              <boxGeometry args={[0.12, 3.2, d]} />
              <meshStandardMaterial color={WALL} roughness={0.95} />
            </mesh>
          ))}
          {/* storefront: low walls either side of the entrance */}
          {[-1, 1].map((s) => (
            <mesh key={`f${s}`} position={[s * (w / 4 + 1), 0.45, d / 2]}>
              <boxGeometry args={[w / 2 - 2, 0.9, 0.12]} />
              <meshStandardMaterial color={WALL} roughness={0.95} />
            </mesh>
          ))}
        </>
      )}
      <mesh position={[0, 0.006, d / 2 - 0.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.6, 1]} />
        <meshStandardMaterial color="#5b4636" roughness={1} />
      </mesh>
      <Html portal={portal} position={[0, 0.05, d / 2 - 0.2]} center transform rotation={[-Math.PI / 2, 0, 0]} scale={0.6} pointerEvents="none">
        <div className="text-[22px] font-semibold tracking-[0.3em] text-stone-100">ENTRANCE</div>
      </Html>
    </group>
  );
}

function Fixture({ section }: { section: Section }) {
  const [cx, cz] = section.center;
  const wood = section.partner ? "#9a8fb5" : "#8a6a48";
  switch (section.kind) {
    case "shelves":
      return (
        <group position={[cx, 0, cz - 1.85]}>
          <mesh position={[0, 1.25, -0.28]}>
            <boxGeometry args={[5.2, 2.5, 0.05]} />
            <meshStandardMaterial color="#efe3d0" />
          </mesh>
          {[0.3, 0.75, 1.2, 1.65, 2.1].map((y) => (
            <mesh key={y} position={[0, y - 0.02, 0]} castShadow receiveShadow>
              <boxGeometry args={[5.2, 0.04, 0.55]} />
              <meshStandardMaterial color={wood} roughness={0.6} />
            </mesh>
          ))}
          {[-2.6, 2.6].map((x) => (
            <mesh key={x} position={[x, 1.25, 0]}>
              <boxGeometry args={[0.06, 2.5, 0.55]} />
              <meshStandardMaterial color={wood} roughness={0.6} />
            </mesh>
          ))}
        </group>
      );
    case "tables":
      return (
        <group position={[cx, 0, cz - 0.2]}>
          {[-1.35, 1.35].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <RoundedBox args={[2.0, 0.06, 0.95]} radius={0.02} position={[0, 0.77, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={wood} roughness={0.55} />
              </RoundedBox>
              <mesh position={[0, 0.38, 0]}>
                <boxGeometry args={[1.7, 0.74, 0.7]} />
                <meshStandardMaterial color="#efe3d0" />
              </mesh>
            </group>
          ))}
        </group>
      );
    case "case":
      return (
        <group position={[cx, 0, cz - 0.25]}>
          <RoundedBox args={[4.4, 0.98, 1.1]} radius={0.03} position={[0, 0.49, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#efe3d0" />
          </RoundedBox>
          <mesh position={[0, 0.985, 0]}>
            <boxGeometry args={[4.4, 0.01, 1.1]} />
            <meshStandardMaterial color={wood} roughness={0.5} />
          </mesh>
        </group>
      );
    case "racks": {
      const bar = (pos: [number, number, number], len: number, rotY: number, h: number) => (
        <group position={pos} rotation={[0, rotY, 0]}>
          <mesh position={[0, h, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.015, 0.015, len, 8]} />
            <meshStandardMaterial color="#b9b2a8" metalness={0.8} roughness={0.3} />
          </mesh>
          {[-len / 2, len / 2].map((x) => (
            <mesh key={x} position={[x, h / 2, 0]}>
              <cylinderGeometry args={[0.015, 0.015, h, 8]} />
              <meshStandardMaterial color="#b9b2a8" metalness={0.8} roughness={0.3} />
            </mesh>
          ))}
        </group>
      );
      return (
        <group>
          {bar([cx, 0, cz - 1.8], 5.0, 0, 1.95)}
          {bar([cx - 2.45, 0, cz - 0.0], 3.2, Math.PI / 2, 1.75)}
          {bar([cx + 2.45, 0, cz - 0.0], 3.2, Math.PI / 2, 1.75)}
        </group>
      );
    }
    default:
      return null;
  }
}

function FittingStage({ section, outfit }: { section: Section; outfit: Product[] }) {
  const [cx, cz] = section.center;
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 0.06, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.8, 0.85, 0.12, 48]} />
        <meshStandardMaterial color="#f7f2ea" roughness={0.4} />
      </mesh>
      <group position={[0, 0.12, 0]}>
        <WornOutfit items={outfit} />
      </group>
      {/* mirror + curtains */}
      <mesh position={[0, 1.3, -1.9]}>
        <boxGeometry args={[1.4, 2.4, 0.04]} />
        <meshStandardMaterial color="#cfd8dc" metalness={0.9} roughness={0.08} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 2.1, 0, -1.2]}>
          <mesh position={[0, 1.2, 0]}>
            <boxGeometry args={[1.0, 2.4, 0.04]} />
            <meshStandardMaterial color="#8c3f2b" roughness={0.95} />
          </mesh>
          <mesh position={[0, 2.45, 0]}>
            <boxGeometry args={[1.1, 0.05, 0.05]} />
            <meshStandardMaterial color="#b9b2a8" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}
      <pointLight position={[0, 2.8, 1.4]} intensity={6} distance={6} decay={1.5} />
    </group>
  );
}

interface Hover {
  product: Product;
  position: THREE.Vector3;
  partner: boolean;
}

function ItemMesh({
  item,
  active,
  selected,
  partner,
  onSelect,
  onHover,
}: {
  item: PlacedItem;
  active: boolean;
  selected: boolean;
  partner: boolean;
  onSelect: (p: Product) => void;
  onHover: (h: Hover | null) => void;
}) {
  const [hover, setHover] = useState(false);
  const hanging = ["top", "bottom", "dress", "outerwear"].includes(item.product.role);
  const lift = hover && active ? 1.06 : 1;
  return (
    <group
      position={item.position}
      rotation={[0, item.rotationY, 0]}
      scale={item.scale * lift}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (!active) return;
        e.stopPropagation();
        setHover(true);
        const [x, y, z] = item.position;
        onHover({ product: item.product, partner, position: new THREE.Vector3(x, y + (hanging ? 0.15 : 0.5), z) });
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        onHover(null);
        document.body.style.cursor = "";
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!active) return;
        e.stopPropagation();
        onSelect(item.product);
      }}
    >
      <ProductModel product={item.product} />
      {(selected || (hover && active)) && (
        <mesh position={[0, hanging ? -(item.position[1] - 0.02) / item.scale : 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.16, 0.2, 32]} />
          <meshBasicMaterial color={selected ? "#c2410c" : "#1c1917"} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

/** Html roots are expensive to mount/unmount, so the tooltip is always mounted and just moves. */
function HoverTip({ hover }: { hover: Hover | null }) {
  const portal = usePortal();
  return (
    <Html portal={portal} position={hover?.position ?? [0, -50, 0]} center pointerEvents="none" zIndexRange={[20, 0]}>
      <div className={`whitespace-nowrap rounded-lg bg-stone-900/90 px-2.5 py-1.5 text-xs text-white shadow-lg ${hover ? "" : "hidden"}`}>
        <div className="font-medium">{hover?.product.title}</div>
        <div className="text-stone-300">
          {hover ? usd(hover.product.price_cents) : ""}
          {hover?.partner ? " · partner store" : ""}
        </div>
      </div>
    </Html>
  );
}

function SectionTile({ section, isMap, onEnter }: { section: Section; isMap: boolean; onEnter: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  const portal = usePortal();
  const [cx, cz] = section.center;
  const [w, d] = section.size;
  return (
    <group>
      <mesh
        position={[cx, 0.01, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onPointerOver={(e) => {
          if (!isMap) return;
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          if (!isMap) return;
          e.stopPropagation();
          onEnter(section.id);
        }}
      >
        <planeGeometry args={[w - 0.2, d - 0.2]} />
        <meshStandardMaterial color={hover && isMap ? "#fff7ed" : section.tint} roughness={0.9} />
      </mesh>
      {section.partner && (
        <mesh position={[cx, 0.012, cz]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.min(w, d) / 2 - 0.25, Math.min(w, d) / 2 - 0.2, 64]} />
          <meshBasicMaterial color="#7c6fa6" transparent opacity={0.35} />
        </mesh>
      )}
      <Html portal={portal} position={[cx, 2.8, cz + 0.4]} center zIndexRange={[10, 0]} style={{ display: isMap ? "block" : "none" }}>
        <button
            onClick={() => onEnter(section.id)}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            className={`pointer-events-auto rounded-lg border px-2 py-1 text-left shadow-md backdrop-blur transition md:rounded-xl md:px-3.5 md:py-2 ${
              hover ? "scale-105 border-stone-900 bg-white" : "border-stone-300 bg-white/85"
            }`}
          >
            <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-stone-900 md:text-sm">
              {section.name}
              {section.partner && <span className="hidden rounded bg-violet-100 px-1 text-[10px] font-medium text-violet-700 md:inline">PARTNER</span>}
            </div>
            <div className="whitespace-nowrap text-[10px] text-stone-600 md:text-xs">{section.partner ? section.subtitle : <span className="hidden md:inline">{section.subtitle}</span>}</div>
          </button>
        </Html>
    </group>
  );
}

function Checkout() {
  return (
    <group position={[6.2, 0, 5.2]}>
      <RoundedBox args={[2.6, 1.0, 0.8]} radius={0.04} position={[0, 0.5, 0]} castShadow>
        <meshStandardMaterial color="#3f3a36" roughness={0.5} />
      </RoundedBox>
      <mesh position={[0.6, 1.12, 0]}>
        <boxGeometry args={[0.35, 0.22, 0.04]} />
        <meshStandardMaterial color="#111" />
      </mesh>
    </group>
  );
}

export default function StoreScene(props: StoreSceneProps) {
  const { sections, view, selectedId, outfit, onEnterSection, onSelectItem, splatUrl } = props;
  const isMap = view === "map";
  const current = sections.find((s) => s.id === view);
  const [hover, setHover] = useState<Hover | null>(null);
  useEffect(() => setHover(null), [view]);
  const overlay = useRef<HTMLDivElement>(null) as React.RefObject<HTMLElement>;
  return (
    <div className="relative h-full w-full overflow-clip">
    <div ref={overlay as React.RefObject<HTMLDivElement>} className="pointer-events-none absolute inset-0 z-10 [&>*]:pointer-events-auto" />
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 45, position: MAP_CAMERA.position, near: 0.05, far: 200 }}>
      <color attach="background" args={["#ebe4d8"]} />
      <hemisphereLight args={["#fffaf2", "#b9a68f", 1.1]} />
      <directionalLight
        position={[6, 12, 8]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <PortalContext.Provider value={overlay}>
      <CameraRig sections={sections} view={view} />
      {splatUrl && <SplatBackdrop url={splatUrl} />}
      <Shell hideWalls={!!splatUrl} />
      <Checkout />
      {sections.map((s) => (
        // Hide sections standing between the camera and the one being browsed (front row when viewing the back row).
        <group key={s.id} visible={!current || s.id === current.id || s.center[1] <= current.center[1] + 0.1}>
          <SectionTile section={s} isMap={isMap} onEnter={onEnterSection} />
          {s.kind === "fitting" ? <FittingStage section={s} outfit={outfit} /> : <Fixture section={s} />}
          {s.items.map((it) => (
            <ItemMesh
              key={it.product.id}
              item={it}
              partner={s.partner}
              active={view === s.id}
              selected={selectedId === it.product.id}
              onSelect={onSelectItem}
              onHover={setHover}
            />
          ))}
        </group>
      ))}
      <HoverTip hover={hover} />
      <ContactShadows position={[0, 0.015, 0]} scale={20} blur={2.4} opacity={0.35} far={4} />
      </PortalContext.Provider>
    </Canvas>
    </div>
  );
}
