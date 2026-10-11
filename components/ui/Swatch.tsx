import type { Product } from "@/lib/types";

/** Product thumbnail without photos: a role silhouette filled with the item's color. */
const PATHS: Record<Product["role"], string> = {
  shoes: "M4 30 L4 20 Q4 16 8 16 L14 16 Q18 22 26 23 L38 25 Q44 26 44 31 L44 33 L4 33 Z",
  top: "M17 8 L24 11 L31 8 L42 14 L38 22 L34 20 L34 40 L14 40 L14 20 L10 22 L6 14 Z",
  outerwear: "M16 7 L24 12 L32 7 L43 13 L41 41 L33 41 L33 22 L24 41 L15 22 L15 41 L7 41 L5 13 Z",
  bottom: "M14 6 L34 6 L37 42 L28 42 L24 17 L20 42 L11 42 Z",
  dress: "M19 6 L29 6 L28 16 L38 42 L10 42 L20 16 Z",
  bag: "M10 18 L38 18 L36 40 L12 40 Z M18 18 Q18 8 24 8 Q30 8 30 18 L27 18 Q27 11 24 11 Q21 11 21 18 Z",
  accessory: "M24 10 A12 12 0 1 1 23.9 10 Z M24 15 A7 7 0 1 0 24.1 15 Z",
};

export default function Swatch({ product, size = 44 }: { product: Product; size?: number }) {
  const light = isLight(product.color.hex);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-stone-50"
      style={{ width: size, height: size }}
      title={`${product.color.name} ${product.subtype.replace(/-/g, " ")}`}
    >
      <svg viewBox="0 0 48 48" width={size * 0.8} height={size * 0.8} aria-hidden>
        <path d={PATHS[product.role]} fill={product.color.hex} fillRule="evenodd" stroke={light ? "#a8a29e" : "none"} strokeWidth={1} />
      </svg>
    </div>
  );
}

function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 205;
}
