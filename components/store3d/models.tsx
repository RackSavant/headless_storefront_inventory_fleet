"use client";

/**
 * Procedural 3D stand-ins for products, so any catalog renders without 3D
 * assets. Shape comes from role + subtype, color from product.color. A product
 * with model_url renders that GLB instead (see ProductModel).
 */
import { RoundedBox, useGLTF } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import * as THREE from "three";
import type { Product } from "@/lib/types";

type V3 = [number, number, number];

function Mat({ color, rough = 0.75, metal = 0 }: { color: string; rough?: number; metal?: number }) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={metal} />;
}

const SOLE_DARK = "#2a2420";
const SOLE_LIGHT = "#f2efe8";

function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

/* ------------------------------------------------------------------ */
/* Shoes: origin at sole center, toe toward +z, ~0.28 m long          */
/* ------------------------------------------------------------------ */

export function ShoeModel({ product }: { product: Product }) {
  const c = product.color.hex;
  const s = product.subtype;
  const leather = /boot|loafer|oxford|derby|pump|stiletto|slide/.test(s);
  const rough = leather ? 0.45 : 0.8;

  if (/sneaker|trainer|running/.test(s)) {
    const sole = s === "canvas-sneaker" ? 0.055 : 0.032;
    return (
      <group>
        <RoundedBox args={[0.1, sole, 0.28]} radius={0.012} position={[0, sole / 2, 0]}>
          <Mat color={s === "running-shoe" ? "#d7ff3a" : SOLE_LIGHT} />
        </RoundedBox>
        <RoundedBox args={[0.094, 0.075, 0.22]} radius={0.032} position={[0, sole + 0.035, -0.02]}>
          <Mat color={c} rough={rough} />
        </RoundedBox>
        <mesh position={[0, sole + 0.022, 0.085]} scale={[1, 0.6, 1.1]}>
          <sphereGeometry args={[0.048, 16, 12]} />
          <Mat color={c} rough={rough} />
        </mesh>
        <mesh position={[0, sole + 0.074, 0.02]}>
          <boxGeometry args={[0.05, 0.006, 0.09]} />
          <Mat color={shade(c, product.color.name.includes("white") ? -0.15 : 0.25)} />
        </mesh>
      </group>
    );
  }

  if (/boot/.test(s)) {
    const shaft = s === "combat-boot" ? 0.2 : s === "hiking-boot" ? 0.16 : s === "ankle-boot" ? 0.13 : 0.15;
    const heel = s === "ankle-boot" ? 0.045 : 0.02;
    const sole = s === "hiking-boot" || s === "combat-boot" ? "#1d1a17" : SOLE_DARK;
    return (
      <group>
        <RoundedBox args={[0.1, 0.025, 0.28]} radius={0.01} position={[0, 0.0125, 0]}>
          <Mat color={sole} />
        </RoundedBox>
        <mesh position={[0, heel / 2, -0.1]}>
          <boxGeometry args={[0.085, heel, 0.07]} />
          <Mat color={sole} />
        </mesh>
        <RoundedBox args={[0.095, 0.075, 0.25]} radius={0.034} position={[0, 0.06, 0.005]}>
          <Mat color={c} rough={rough} />
        </RoundedBox>
        <mesh position={[0, 0.07 + shaft / 2, -0.07]}>
          <cylinderGeometry args={[0.052, 0.05, shaft, 18]} />
          <Mat color={c} rough={rough} />
        </mesh>
        {s === "chelsea-boot" && (
          <mesh position={[0.051, 0.07 + shaft / 2, -0.07]}>
            <boxGeometry args={[0.004, shaft * 0.8, 0.035]} />
            <Mat color="#222" />
          </mesh>
        )}
        {(s === "combat-boot" || s === "hiking-boot") && (
          <mesh position={[0, 0.08 + shaft / 2, -0.02]}>
            <boxGeometry args={[0.04, shaft, 0.012]} />
            <Mat color={shade(c, 0.2)} />
          </mesh>
        )}
      </group>
    );
  }

  if (/stiletto|pump|sandal/.test(s)) {
    const H = s === "stiletto" ? 0.1 : s === "pump" ? 0.085 : 0.065;
    const heelR = s === "strappy-sandal" ? 0.018 : 0.007;
    const slope = Math.atan2(H, 0.17);
    return (
      <group>
        {/* sloped insole from heel cup down to toe */}
        <mesh position={[0, H / 2 + 0.006, -0.02]} rotation={[slope, 0, 0]}>
          <boxGeometry args={[0.075, 0.012, 0.2]} />
          <Mat color={s === "strappy-sandal" ? shade(c, -0.2) : c} rough={0.5} />
        </mesh>
        <mesh position={[0, 0.008, 0.095]}>
          <boxGeometry args={[0.078, 0.016, 0.07]} />
          <Mat color={SOLE_DARK} />
        </mesh>
        <mesh position={[0, H / 2, -0.11]}>
          <cylinderGeometry args={[heelR * 1.4, heelR, H, 12]} />
          <Mat color={s === "pump" ? c : shade(c, -0.25)} rough={0.4} />
        </mesh>
        {s === "strappy-sandal" ? (
          [0.08, 0.04, -0.07].map((z, i) => (
            <mesh key={i} position={[0, 0.03 + (0.06 - z) * 0.35, z]} rotation={[slope, 0, 0]}>
              <torusGeometry args={[0.04, 0.005, 6, 18, Math.PI]} />
              <Mat color={c} rough={0.5} />
            </mesh>
          ))
        ) : (
          <>
            <mesh position={[0, 0.03, 0.08]} scale={[1, 0.7, 1.4]}>
              <sphereGeometry args={[0.042, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <Mat color={c} rough={0.45} />
            </mesh>
            <mesh position={[0, H + 0.02, -0.1]}>
              <cylinderGeometry args={[0.042, 0.04, 0.045, 18, 1, true, -Math.PI / 2, Math.PI]} />
              <meshStandardMaterial color={c} roughness={0.45} side={THREE.DoubleSide} />
            </mesh>
            {s === "stiletto" &&
              [-1, 1].map((d) => (
                <mesh key={d} position={[0, H * 0.55, 0.0]} rotation={[0.3, 0, d * 0.7]}>
                  <boxGeometry args={[0.006, 0.006, 0.14]} />
                  <Mat color={c} rough={0.45} />
                </mesh>
              ))}
          </>
        )}
      </group>
    );
  }

  if (s === "slide") {
    return (
      <group>
        <RoundedBox args={[0.1, 0.03, 0.27]} radius={0.012} position={[0, 0.015, 0]}>
          <Mat color={shade(c, -0.15)} rough={0.5} />
        </RoundedBox>
        <RoundedBox args={[0.104, 0.035, 0.08]} radius={0.012} position={[0, 0.045, 0.04]}>
          <Mat color={c} rough={0.45} />
        </RoundedBox>
      </group>
    );
  }

  // loafer / oxford / derby and anything unknown
  return (
    <group>
      <RoundedBox args={[0.098, 0.02, 0.28]} radius={0.008} position={[0, 0.01, 0]}>
        <Mat color={SOLE_DARK} />
      </RoundedBox>
      <mesh position={[0, 0.02, -0.105]}>
        <boxGeometry args={[0.085, 0.02, 0.06]} />
        <Mat color={SOLE_DARK} />
      </mesh>
      <RoundedBox args={[0.092, 0.06, 0.255]} radius={0.028} position={[0, 0.048, 0]}>
        <Mat color={c} rough={rough} />
      </RoundedBox>
      {s === "loafer" ? (
        <mesh position={[0, 0.076, 0.04]}>
          <boxGeometry args={[0.07, 0.008, 0.025]} />
          <Mat color={shade(c, -0.12)} rough={0.4} />
        </mesh>
      ) : (
        <mesh position={[0, 0.078, 0.0]}>
          <boxGeometry args={[0.04, 0.006, 0.08]} />
          <Mat color={shade(c, -0.12)} rough={0.4} />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Garments on hangers: origin at hanger hook, hanging down -y         */
/* ------------------------------------------------------------------ */

function Hanger() {
  return (
    <group>
      <mesh position={[0, -0.03, 0]}>
        <torusGeometry args={[0.025, 0.004, 6, 12, Math.PI * 1.4]} />
        <Mat color="#8a6a48" rough={0.4} />
      </mesh>
      <mesh position={[0, -0.075, 0]}>
        <boxGeometry args={[0.42, 0.014, 0.02]} />
        <Mat color="#8a6a48" rough={0.4} />
      </mesh>
    </group>
  );
}

function longSleeves(subtype: string) {
  return !/tee|tank|camisole|polo|band-tee/.test(subtype);
}

export function HangingGarment({ product }: { product: Product }) {
  const c = product.color.hex;
  const s = product.subtype;
  const rough = /leather/.test(s) ? 0.45 : /satin|silk|slip/.test(s) ? 0.35 : 0.85;

  if (product.role === "top" || product.role === "outerwear") {
    const outer = product.role === "outerwear";
    const len = s === "wool-coat" || s === "trench-coat" ? 0.95 : outer ? 0.62 : 0.56;
    const w = outer ? 0.46 : 0.4;
    const sleeveLen = s === "tank" || s === "silk-camisole" ? 0 : longSleeves(s) || outer ? 0.5 : 0.18;
    return (
      <group>
        <Hanger />
        <RoundedBox args={[w, len, 0.05]} radius={0.02} position={[0, -0.08 - len / 2, 0]}>
          <Mat color={c} rough={rough} />
        </RoundedBox>
        {sleeveLen > 0 &&
          [-1, 1].map((d) => (
            <mesh key={d} position={[d * (w / 2 + 0.03), -0.1 - sleeveLen / 2, 0]} rotation={[0, 0, d * 0.12]}>
              <boxGeometry args={[0.1, sleeveLen, 0.045]} />
              <Mat color={shade(c, -0.04)} rough={rough} />
            </mesh>
          ))}
        {outer && (
          <mesh position={[0, -0.08 - len / 2, 0.027]}>
            <boxGeometry args={[0.008, len * 0.95, 0.004]} />
            <Mat color={shade(c, -0.2)} />
          </mesh>
        )}
      </group>
    );
  }

  if (product.role === "dress") {
    const len = s === "maxi-dress" ? 1.25 : s === "cocktail-dress" ? 0.85 : 1.0;
    return (
      <group>
        <Hanger />
        <mesh position={[0, -0.08 - len / 2, 0]} scale={[1, 1, 0.22]}>
          <cylinderGeometry args={[0.18, 0.34, len, 24]} />
          <Mat color={c} rough={rough} />
        </mesh>
      </group>
    );
  }

  // bottoms, hung from the waistband
  const skirt = /skirt/.test(s);
  const legLen = /short/.test(s) ? 0.3 : 0.95;
  return (
    <group>
      <Hanger />
      <mesh position={[0, -0.11, 0]}>
        <boxGeometry args={[0.38, 0.06, 0.05]} />
        <Mat color={shade(c, -0.05)} rough={rough} />
      </mesh>
      {skirt ? (
        <mesh position={[0, -0.14 - (s === "mini-skirt" ? 0.18 : 0.33), 0]} scale={[1, 1, 0.2]}>
          <cylinderGeometry args={[0.19, s === "mini-skirt" ? 0.26 : 0.33, s === "mini-skirt" ? 0.36 : 0.66, 20]} />
          <Mat color={c} rough={rough} />
        </mesh>
      ) : (
        [-1, 1].map((d) => (
          <mesh key={d} position={[d * 0.095, -0.14 - legLen / 2, 0]} rotation={[0, 0, d * (s === "wide-leg-trouser" ? 0.05 : 0.015)]}>
            <boxGeometry args={[s === "wide-leg-trouser" ? 0.2 : 0.17, legLen, 0.05]} />
            <Mat color={c} rough={rough} />
          </mesh>
        ))
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Bags and accessories: origin at the bottom, sitting on a surface    */
/* ------------------------------------------------------------------ */

export function BagModel({ product }: { product: Product }) {
  const c = product.color.hex;
  const s = product.subtype;
  const rough = /canvas|nylon/.test(product.title.toLowerCase()) ? 0.9 : 0.45;
  const dims: Record<string, V3> = {
    tote: [0.36, 0.3, 0.13],
    crossbody: [0.22, 0.16, 0.07],
    clutch: [0.26, 0.12, 0.04],
    backpack: [0.3, 0.4, 0.15],
    "belt-bag": [0.26, 0.12, 0.07],
  };
  const [w, h, d] = dims[s] ?? [0.28, 0.22, 0.1];
  return (
    <group>
      <RoundedBox args={[w, h, d]} radius={Math.min(0.03, d / 2.2)} position={[0, h / 2, 0]}>
        <Mat color={c} rough={rough} />
      </RoundedBox>
      {s === "tote" &&
        [-1, 1].map((x) => (
          <mesh key={x} position={[x * 0.08, h, 0]}>
            <torusGeometry args={[0.055, 0.008, 6, 18, Math.PI]} />
            <Mat color={shade(c, -0.15)} rough={0.5} />
          </mesh>
        ))}
      {(s === "crossbody" || s === "belt-bag") && (
        <mesh position={[0, h, 0]}>
          <torusGeometry args={[s === "crossbody" ? 0.2 : 0.13, 0.006, 6, 24, Math.PI]} />
          <Mat color={shade(c, -0.15)} rough={0.5} />
        </mesh>
      )}
      {s !== "tote" && s !== "backpack" && (
        <mesh position={[0, h * 0.75, d / 2 + 0.002]}>
          <boxGeometry args={[w * 0.96, h * 0.45, 0.004]} />
          <Mat color={shade(c, -0.08)} rough={rough} />
        </mesh>
      )}
      {s === "backpack" && (
        <mesh position={[0, h * 0.35, d / 2 + 0.03]}>
          <boxGeometry args={[w * 0.7, h * 0.4, 0.06]} />
          <Mat color={shade(c, 0.05)} rough={rough} />
        </mesh>
      )}
    </group>
  );
}

export function AccessoryModel({ product }: { product: Product }) {
  const c = product.color.hex;
  const s = product.subtype;
  const metal = /gold|silver|steel/.test(product.color.name + product.title.toLowerCase());
  switch (s) {
    case "socks":
      return (
        <group>
          {[-0.05, 0.05].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh position={[0, 0.02, 0.03]}>
                <boxGeometry args={[0.07, 0.04, 0.16]} />
                <Mat color={c} rough={0.95} />
              </mesh>
              <mesh position={[0, 0.1, -0.03]}>
                <boxGeometry args={[0.07, 0.16, 0.04]} />
                <Mat color={c} rough={0.95} />
              </mesh>
            </group>
          ))}
        </group>
      );
    case "belt":
      return (
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <mesh>
            <torusGeometry args={[0.1, 0.012, 6, 28]} />
            <Mat color={c} rough={0.45} />
          </mesh>
          <mesh position={[0.1, 0, 0]}>
            <boxGeometry args={[0.03, 0.04, 0.03]} />
            <Mat color="#c9b27c" metal={0.8} rough={0.3} />
          </mesh>
        </group>
      );
    case "scarf":
      return (
        <RoundedBox args={[0.3, 0.08, 0.18]} radius={0.03} position={[0, 0.04, 0]}>
          <Mat color={c} rough={0.95} />
        </RoundedBox>
      );
    case "beanie":
    case "cap":
    case "sun-hat":
      return (
        <group>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <Mat color={c} rough={0.9} />
          </mesh>
          {s !== "beanie" && (
            <mesh position={[0, 0.005, s === "cap" ? 0.08 : 0]} scale={s === "cap" ? [0.8, 1, 0.6] : [1, 1, 1]}>
              <cylinderGeometry args={[s === "cap" ? 0.11 : 0.2, s === "cap" ? 0.11 : 0.2, 0.008, 28]} />
              <Mat color={c} rough={0.9} />
            </mesh>
          )}
        </group>
      );
    case "sunglasses":
      return (
        <group position={[0, 0.03, 0]}>
          {[-0.04, 0.04].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 0.008, 20]} />
              <Mat color={c} rough={0.2} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[0.14, 0.008, 0.008]} />
            <Mat color={c} rough={0.3} />
          </mesh>
        </group>
      );
    default:
      // necklace / watch / unknown small items
      return (
        <group position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <torusGeometry args={[s === "watch" ? 0.04 : 0.08, 0.005, 8, 32]} />
            <Mat color={c} metal={metal ? 0.9 : 0} rough={metal ? 0.25 : 0.6} />
          </mesh>
          {s === "watch" && (
            <mesh>
              <cylinderGeometry args={[0.022, 0.022, 0.01, 20]} />
              <Mat color="#e8e8e8" metal={0.9} rough={0.2} />
            </mesh>
          )}
        </group>
      );
  }
}

/** Optional real GLB, normalized to `size` meters on its longest side, sitting on y=0. */
function GlbModel({ url, size }: { url: string; size: number }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const dims = box.getSize(new THREE.Vector3());
    const k = size / Math.max(dims.x, dims.y, dims.z, 1e-6);
    clone.scale.setScalar(k);
    const b2 = new THREE.Box3().setFromObject(clone);
    const center = b2.getCenter(new THREE.Vector3());
    clone.position.set(-center.x, -b2.min.y, -center.z);
    return clone;
  }, [scene, size]);
  return <primitive object={obj} />;
}

/** Display model for a product on a fixture. */
export function ProductModel({ product }: { product: Product }) {
  const procedural =
    product.role === "shoes" ? (
      <ShoeModel product={product} />
    ) : product.role === "bag" ? (
      <BagModel product={product} />
    ) : product.role === "accessory" ? (
      <AccessoryModel product={product} />
    ) : (
      <HangingGarment product={product} />
    );
  if (!product.model_url) return procedural;
  const size = product.role === "shoes" ? 0.28 : product.role === "bag" ? 0.35 : 0.9;
  return (
    <Suspense fallback={procedural}>
      <GlbModel url={product.model_url} size={size} />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/* Mannequin + worn outfit (mannequin faces +z, feet at y=0, ~1.75 m)  */
/* ------------------------------------------------------------------ */

const SKIN = "#e7e2da";

function Capsule({ r, len, pos, rot = [0, 0, 0], color, rough = 0.6 }: { r: number; len: number; pos: V3; rot?: V3; color: string; rough?: number }) {
  return (
    <mesh position={pos} rotation={rot} castShadow>
      <capsuleGeometry args={[r, len, 6, 16]} />
      <Mat color={color} rough={rough} />
    </mesh>
  );
}

export function Mannequin({ barefoot }: { barefoot: boolean }) {
  return (
    <group>
      {[-1, 1].map((d) => (
        <Capsule key={`l${d}`} r={0.058} len={0.74} pos={[d * 0.095, 0.5, 0]} color={SKIN} />
      ))}
      <mesh position={[0, 0.95, 0]} scale={[1, 0.62, 0.68]} castShadow>
        <sphereGeometry args={[0.17, 24, 16]} />
        <Mat color={SKIN} rough={0.6} />
      </mesh>
      <mesh position={[0, 1.2, 0]} scale={[1, 1, 0.64]} castShadow>
        <cylinderGeometry args={[0.17, 0.14, 0.5, 24]} />
        <Mat color={SKIN} rough={0.6} />
      </mesh>
      <Capsule r={0.06} len={0.3} pos={[0, 1.43, 0]} rot={[0, 0, Math.PI / 2]} color={SKIN} />
      {[-1, 1].map((d) => (
        <Capsule key={`a${d}`} r={0.043} len={0.6} pos={[d * 0.235, 1.11, 0]} rot={[0, 0, d * 0.08]} color={SKIN} />
      ))}
      <mesh position={[0, 1.51, 0]}>
        <cylinderGeometry args={[0.048, 0.052, 0.1, 16]} />
        <Mat color={SKIN} rough={0.6} />
      </mesh>
      <mesh position={[0, 1.65, 0]} scale={[1, 1.18, 1]} castShadow>
        <sphereGeometry args={[0.1, 24, 18]} />
        <Mat color={SKIN} rough={0.5} />
      </mesh>
      {barefoot &&
        [-1, 1].map((d) => (
          <RoundedBox key={`f${d}`} args={[0.085, 0.05, 0.22]} radius={0.02} position={[d * 0.095, 0.03, 0.04]}>
            <Mat color={SKIN} rough={0.6} />
          </RoundedBox>
        ))}
    </group>
  );
}

function WornTop({ p, outer }: { p: Product; outer: boolean }) {
  const c = p.color.hex;
  const s = p.subtype;
  const rough = /leather/.test(s) ? 0.45 : /silk|satin|bomber/.test(s) ? 0.35 : 0.85;
  const coat = s === "wool-coat" || s === "trench-coat";
  const pad = outer ? 0.045 : 0.02;
  const len = coat ? 1.0 : outer ? 0.64 : 0.54;
  const cy = 1.47 - len / 2;
  const sleeves = s === "tank" || s === "silk-camisole" ? 0 : outer || longSleeves(s) ? 0.58 : 0.15;
  return (
    <group>
      <mesh position={[0, cy, 0]} scale={[1, 1, outer ? 0.75 : 0.7]} castShadow>
        <cylinderGeometry args={[0.17 + pad, (coat ? 0.24 : 0.15) + pad, len, 28]} />
        <Mat color={c} rough={rough} />
      </mesh>
      {sleeves > 0 && (
        <>
          <Capsule r={0.065 + pad * 0.6} len={0.3} pos={[0, 1.43, 0]} rot={[0, 0, Math.PI / 2]} color={c} rough={rough} />
          {[-1, 1].map((d) => (
            <Capsule
              key={d}
              r={0.052 + pad * 0.5}
              len={sleeves}
              pos={[d * (0.238 + pad * 0.1), 1.41 - sleeves / 2 - 0.02, 0]}
              rot={[0, 0, d * 0.08]}
              color={shade(c, -0.03)}
              rough={rough}
            />
          ))}
        </>
      )}
      {s === "hoodie" && (
        <mesh position={[0, 1.5, -0.08]} scale={[1, 0.8, 0.8]}>
          <sphereGeometry args={[0.13, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <Mat color={c} rough={rough} />
        </mesh>
      )}
      {outer && (
        <mesh position={[0, cy, 0.17 * 0.75 + pad * 0.75 - 0.005]}>
          <boxGeometry args={[0.01, len * 0.96, 0.01]} />
          <Mat color={shade(c, -0.25)} />
        </mesh>
      )}
    </group>
  );
}

function WornBottom({ p }: { p: Product }) {
  const c = p.color.hex;
  const s = p.subtype;
  const rough = /leather|satin/.test(s) ? 0.4 : 0.85;
  if (/skirt/.test(s)) {
    const len = s === "mini-skirt" ? 0.32 : 0.62;
    return (
      <mesh position={[0, 1.0 - len / 2, 0]} scale={[1, 1, 0.75]} castShadow>
        <cylinderGeometry args={[0.18, s === "mini-skirt" ? 0.23 : 0.3, len, 28]} />
        <Mat color={c} rough={rough} />
      </mesh>
    );
  }
  const shorts = /short/.test(s);
  const len = shorts ? 0.26 : 0.82;
  const bottomR = s === "wide-leg-trouser" ? 0.12 : s === "jogger" || s === "legging" ? 0.06 : 0.075;
  return (
    <group>
      <mesh position={[0, 0.93, 0]} scale={[1, 1, 0.7]} castShadow>
        <cylinderGeometry args={[0.185, 0.2, 0.18, 24]} />
        <Mat color={c} rough={rough} />
      </mesh>
      {[-1, 1].map((d) => (
        <mesh key={d} position={[d * 0.098, 0.86 - len / 2, 0]} castShadow>
          <cylinderGeometry args={[s === "legging" ? 0.068 : 0.085, bottomR, len, 18]} />
          <Mat color={c} rough={rough} />
        </mesh>
      ))}
    </group>
  );
}

function WornDress({ p }: { p: Product }) {
  const c = p.color.hex;
  const s = p.subtype;
  const rough = /slip|cocktail/.test(s) ? 0.35 : 0.85;
  const hem = s === "maxi-dress" ? 0.1 : s === "cocktail-dress" ? 0.58 : s === "knit-midi-dress" ? 0.36 : 0.45;
  const sleeves = s === "shirt-dress" || s === "knit-midi-dress" ? (s === "knit-midi-dress" ? 0.58 : 0.16) : 0;
  return (
    <group>
      <mesh position={[0, 1.22, 0]} scale={[1, 1, 0.68]} castShadow>
        <cylinderGeometry args={[0.185, 0.16, 0.5, 26]} />
        <Mat color={c} rough={rough} />
      </mesh>
      <mesh position={[0, (0.98 + hem) / 2, 0]} scale={[1, 1, 0.78]} castShadow>
        <cylinderGeometry args={[0.17, s === "cocktail-dress" ? 0.27 : 0.33, 0.98 - hem, 30]} />
        <Mat color={c} rough={rough} />
      </mesh>
      {sleeves > 0 &&
        [-1, 1].map((d) => (
          <Capsule key={d} r={0.055} len={sleeves} pos={[d * 0.24, 1.41 - sleeves / 2 - 0.02, 0]} rot={[0, 0, d * 0.08]} color={c} rough={rough} />
        ))}
    </group>
  );
}

function WornAccessory({ p }: { p: Product }) {
  const c = p.color.hex;
  switch (p.subtype) {
    case "belt":
      return (
        <mesh position={[0, 0.985, 0]} scale={[1, 1, 0.72]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.19, 0.016, 6, 32]} />
          <Mat color={c} rough={0.45} />
        </mesh>
      );
    case "socks":
      return (
        <>
          {[-1, 1].map((d) => (
            <mesh key={d} position={[d * 0.095, 0.12, 0]}>
              <cylinderGeometry args={[0.064, 0.062, 0.12, 16]} />
              <Mat color={c} rough={0.95} />
            </mesh>
          ))}
        </>
      );
    case "scarf":
      return (
        <mesh position={[0, 1.47, 0.01]} rotation={[Math.PI / 2 - 0.15, 0, 0]}>
          <torusGeometry args={[0.1, 0.045, 10, 24]} />
          <Mat color={c} rough={0.95} />
        </mesh>
      );
    case "necklace":
      return (
        <mesh position={[0, 1.43, 0.03]} rotation={[Math.PI / 2 - 0.5, 0, 0]}>
          <torusGeometry args={[0.1, 0.004, 6, 32]} />
          <Mat color={c} metal={0.9} rough={0.25} />
        </mesh>
      );
    case "watch":
      return (
        <mesh position={[-0.262, 0.84, 0]} rotation={[0, 0, Math.PI / 2 - 0.08]}>
          <torusGeometry args={[0.047, 0.012, 8, 20]} />
          <Mat color={c} metal={0.9} rough={0.25} />
        </mesh>
      );
    case "sunglasses":
      return (
        <group position={[0, 1.68, 0.1]}>
          <AccessoryModel product={p} />
        </group>
      );
    case "beanie":
    case "cap":
    case "sun-hat":
      return (
        <group position={[0, 1.71, 0]} scale={1.08}>
          <AccessoryModel product={p} />
        </group>
      );
    default:
      return null;
  }
}

export function WornOutfit({ items }: { items: Product[] }) {
  const by = (role: Product["role"]) => items.find((p) => p.role === role);
  const shoes = by("shoes");
  const top = by("top");
  const bottom = by("bottom");
  const dress = by("dress");
  const outer = by("outerwear");
  const bag = by("bag");
  const acc = by("accessory");
  return (
    <group>
      <Mannequin barefoot={!shoes} />
      {acc?.subtype === "socks" && <WornAccessory p={acc} />}
      {bottom && !dress && <WornBottom p={bottom} />}
      {dress && <WornDress p={dress} />}
      {top && !dress && <WornTop p={top} outer={false} />}
      {outer && <WornTop p={outer} outer />}
      {shoes &&
        [-1, 1].map((d) => (
          <group key={d} position={[d * 0.095, 0, 0.035]}>
            <ShoeModel product={shoes} />
          </group>
        ))}
      {bag && (
        <group position={[0.33, bag.subtype === "backpack" ? 0.95 : 0.68, 0]} rotation={[0, Math.PI / 2, 0]}>
          <BagModel product={bag} />
        </group>
      )}
      {acc && acc.subtype !== "socks" && !(acc.subtype === "belt" && (outer || dress)) && <WornAccessory p={acc} />}
    </group>
  );
}
