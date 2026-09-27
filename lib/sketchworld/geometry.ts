/**
 * Geometry builders for the procedural sketch world.
 */

import { BufferGeometry, Float32BufferAttribute } from "three";

/** Builds a flat ribbon mesh along a centerline. */
export function buildRoadRibbon(
  points: Array<[number, number]>,
  width: number,
  raiseY: number,
): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const extended: Array<[number, number]> = [...points];
  if (points.length >= 2) {
    // Extend both ends along the tangent so the road exits cleanly.
    const first = points[1];
    const second = points[0];
    const last = points[points.length - 2];
    const secondLast = points[points.length - 1];
    const startDir = [
      first[0] - second[0],
      first[1] - second[1],
    ] as [number, number];
    const endDir = [
      last[0] - secondLast[0],
      last[1] - secondLast[1],
    ] as [number, number];
    const startLen = Math.hypot(startDir[0], startDir[1]) || 1;
    const endLen = Math.hypot(endDir[0], endDir[1]) || 1;
    const extension = 8;
    extended.unshift([
      points[0][0] - (startDir[0] / startLen) * extension,
      points[0][1] - (startDir[1] / startLen) * extension,
    ]);
    extended.push([
      points[points.length - 1][0] + (endDir[0] / endLen) * extension,
      points[points.length - 1][1] + (endDir[1] / endLen) * extension,
    ]);
  }
  const halfWidth = width / 2;
  for (const [x, z] of extended) {
    positions.push(x, raiseY, z);
    positions.push(x, raiseY, z);
  }
  for (let i = 0; i < extended.length - 1; i++) {
    const [x0, z0] = extended[i];
    const [x1, z1] = extended[i + 1];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const length = Math.hypot(dx, dz) || 1;
    const px = -dz / length;
    const pz = dx / length;
    const base = i * 2;
    positions[base * 3] = x0 + px * halfWidth;
    positions[base * 3 + 2] = z0 + pz * halfWidth;
    positions[(base + 1) * 3] = x0 - px * halfWidth;
    positions[(base + 1) * 3 + 2] = z0 - pz * halfWidth;
    const next = base + 2;
    positions[next * 3] = x1 + px * halfWidth;
    positions[next * 3 + 2] = z1 + pz * halfWidth;
    positions[(next + 1) * 3] = x1 - px * halfWidth;
    positions[(next + 1) * 3 + 2] = z1 - pz * halfWidth;
    indices.push(base, base + 2, base + 1);
    indices.push(base + 1, base + 2, base + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds a wedge (prism) mesh. The low edge is at local -depth/2 and the
 * high edge at +depth/2, so rotating the mesh by yaw points the approach
 * toward the road.
 */
export function buildWedge(
  width: number,
  depth: number,
  height: number,
): BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const positions = [
    -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd, -hw, height, hd, hw,
    height, hd,
  ];
  const indices = [
    0, 2, 1, 0, 3, 2, 3, 5, 4, 3, 2, 5, 2, 1, 5, 1, 4, 5, 0, 4, 3, 1, 2, 0,
    0, 1, 4,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Builds a simple low-poly tree (trunk cylinder + cone canopy). */
export function buildTreeGeometry(): { trunk: BufferGeometry; canopy: BufferGeometry } {
  const trunk = new BufferGeometry();
  const trunkPositions: number[] = [];
  const trunkIndices: number[] = [];
  const segments = 5;
  const trunkRadius = 0.28;
  const trunkHeight = 2.2;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * trunkRadius;
    const z = Math.sin(angle) * trunkRadius;
    trunkPositions.push(x, 0, z, x, trunkHeight, z);
  }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const a = i * 2;
    const b = next * 2;
    trunkIndices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  trunk.setAttribute("position", new Float32BufferAttribute(trunkPositions, 3));
  trunk.setIndex(trunkIndices);
  trunk.computeVertexNormals();

  const canopy = new BufferGeometry();
  const canopyRadius = 1.7;
  const canopyHeight = 2.6;
  const canopyPositions: number[] = [];
  const canopyIndices: number[] = [];
  const apexIndex = segments;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    canopyPositions.push(
      Math.cos(angle) * canopyRadius,
      0,
      Math.sin(angle) * canopyRadius,
    );
  }
  canopyPositions.push(0, canopyHeight, 0);
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    canopyIndices.push(i, apexIndex, next);
  }
  canopy.setAttribute(
    "position",
    new Float32BufferAttribute(canopyPositions, 3),
  );
  canopy.setIndex(canopyIndices);
  canopy.computeVertexNormals();
  return { trunk, canopy };
}

/** Builds a plain box geometry helper (shared instance-friendly usage). */
export function buildBox(
  width: number,
  height: number,
  depth: number,
): BufferGeometry {
  const geometry = new BufferGeometry();
  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        -hw, -hh, -hd, hw, -hh, -hd, hw, hh, -hd, -hw, hh, -hd, -hw, -hh,
        hd, hw, -hh, hd, hw, hh, hd, -hw, hh, hd,
      ],
      3,
    ),
  );
  geometry.setIndex([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}