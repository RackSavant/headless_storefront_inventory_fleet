import * as THREE from "three";

export interface Drape {
  height: number;
  shoulder: number;
  softness: number;
  puffy: boolean;
}

export function clothDepth(x: number, y: number, drape: Drape, side = 1): number {
  const t = THREE.MathUtils.clamp(-y / drape.height, 0, 1);
  const release = 1 - Math.exp(-t * 10);
  const center = Math.exp(-Math.pow(x / (drape.shoulder * 0.95), 4));
  const folds = drape.softness * release * (
    Math.sin(x * 48 + Math.sin(t * 3) * 0.8) * 0.008 +
    Math.sin(x * 23 - t * 4) * 0.005 +
    Math.sin(t * 19 + Math.abs(x) * 13) * 0.003
  );
  const loft = 0.003 + release * (0.012 + center * 0.022);
  const quilting = drape.puffy ? 0.018 * Math.pow(Math.sin(t * Math.PI * 6), 2) : 0;
  return folds + side * (loft + quilting);
}

export function clothGeometry(shape: THREE.Shape, drape: Drape): THREE.BufferGeometry {
  const flat = new THREE.ShapeGeometry(shape, 14);
  const source = flat.getAttribute("position");
  const index = flat.getIndex()!;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const emit = (point: THREE.Vector2, side: number) => {
    const { x, y } = point;
    const e = 0.0001;
    const dx = (clothDepth(x + e, y, drape, side) - clothDepth(x - e, y, drape, side)) / (2 * e);
    const dy = (clothDepth(x, y + e, drape, side) - clothDepth(x, y - e, drape, side)) / (2 * e);
    const normal = new THREE.Vector3(-dx * side, -dy * side, side).normalize();
    positions.push(x, y, clothDepth(x, y, drape, side));
    normals.push(normal.x, normal.y, normal.z);
    uvs.push(x, y);
  };
  const subdivide = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, depth = 0) => {
    const edges = [a.distanceToSquared(b), b.distanceToSquared(c), c.distanceToSquared(a)];
    const longest = Math.max(...edges);
    if (longest > 0.045 ** 2 && depth < 10) {
      const edge = edges.indexOf(longest);
      const [p, q, r] = edge === 0 ? [a, b, c] : edge === 1 ? [b, c, a] : [c, a, b];
      const mid = p.clone().lerp(q, 0.5);
      subdivide(p, mid, r, depth + 1);
      subdivide(mid, q, r, depth + 1);
      return;
    }
    for (const point of [a, b, c]) emit(point, 1);
    for (const point of [c, b, a]) emit(point, -1);
  };
  const point = (i: number) => new THREE.Vector2(source.getX(index.getX(i)), source.getY(index.getX(i)));
  for (let i = 0; i < index.count; i += 3) subdivide(point(i), point(i + 1), point(i + 2));
  flat.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

export function drapeDetail(object: THREE.Object3D, drape: Drape, front: number) {
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const inverse = child.matrixWorld.clone().invert();
    const position = child.geometry.getAttribute("position");
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
      point.z += clothDepth(point.x, point.y, drape) - front;
      point.applyMatrix4(inverse);
      position.setXYZ(i, point.x, point.y, point.z);
    }
    child.geometry.computeVertexNormals();
    child.geometry.computeBoundingSphere();
  });
}
