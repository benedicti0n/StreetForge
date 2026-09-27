/**
 * Procedural world descriptor and builder.
 *
 * The parsed sketch is converted into a flat, stylized, playable world:
 * a road ribbon follows the drawn path, ramps/buildings/trees become clean
 * geometric props, and the spawn points sit on the road itself.
 */

import type { ParsedSketch } from "./parseSketch";

export interface ProceduralWorldDescriptor {
  kind: "procedural";
  worldId: string;
  caption: string;
  /** World footprint in metres (square). */
  worldSize: number;
  /** Road centerline in world XZ metres. */
  road: { points: Array<[number, number]>; width: number };
  ramps: Array<{
    position: [number, number, number];
    width: number;
    depth: number;
    height: number;
    yaw: number;
  }>;
  buildings: Array<{
    position: [number, number, number];
    size: [number, number, number];
    yaw: number;
  }>;
  trees: Array<{ position: [number, number, number]; scale: number }>;
  spawns: {
    player: { position: [number, number, number]; yaw: number };
    police: { position: [number, number, number]; yaw: number };
  };
  halfExtent: number;
}

export const PROCEDURAL_WORLD_SIZE = 160;
const ROAD_RAISE = 0.07;
const SPAWN_PLAYER_ALONG = 0.35;
const SPAWN_POLICE_BEHIND_M = 12;

/** Chaikin smoothing of a polyline (two passes). */
function smoothPath(
  points: Array<[number, number]>,
  iterations = 2,
): Array<[number, number]> {
  let path = points;
  for (let pass = 0; pass < iterations; pass++) {
    if (path.length < 3) {
      break;
    }
    const smoothed: Array<[number, number]> = [path[0]];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      smoothed.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      smoothed.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    smoothed.push(path[path.length - 1]);
    path = smoothed;
  }
  return path;
}

/** Resample a polyline to roughly uniform spacing. */
function resamplePath(
  points: Array<[number, number]>,
  spacing: number,
): Array<[number, number]> {
  if (points.length < 2) {
    return [...points];
  }
  const out: Array<[number, number]> = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const dx = bx - ax;
    const dy = by - ay;
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength === 0) {
      continue;
    }
    let travelled = carry;
    while (travelled < segmentLength) {
      const t = travelled / segmentLength;
      out.push([ax + dx * t, ay + dy * t]);
      travelled += spacing;
    }
    carry = travelled - segmentLength;
  }
  const last = points[points.length - 1];
  if (
    out.length === 0 ||
    out[out.length - 1][0] !== last[0] ||
    out[out.length - 1][1] !== last[1]
  ) {
    out.push(last);
  }
  return out;
}

function gridToWorld(
  gx: number,
  gy: number,
  grid: number,
  worldSize: number,
): [number, number] {
  return [
    (gx / (grid - 1) - 0.5) * worldSize,
    (gy / (grid - 1) - 0.5) * worldSize,
  ];
}

/** Default playable road used when the sketch has no readable road. */
function defaultRoadPath(worldSize: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const samples = 48;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    points.push([
      (t - 0.5) * worldSize * 0.85,
      (0.5 - Math.sin(t * Math.PI) * 0.42) * worldSize * 0.85,
    ]);
  }
  return points;
}

function pathTangent(
  points: Array<[number, number]>,
  index: number,
): [number, number] {
  const before = Math.max(0, index - 1);
  const after = Math.min(points.length - 1, index + 1);
  const [ax, az] = points[before];
  const [bx, bz] = points[after];
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  if (length < 0.0001) {
    return [1, 0];
  }
  return [dx / length, dz / length];
}

function spawnAlongPath(
  points: Array<[number, number]>,
  distanceAlong: number,
): { position: [number, number, number]; yaw: number } {
  const length = points.length;
  const index = Math.max(
    1,
    Math.min(length - 2, Math.round(distanceAlong * (length - 1))),
  );
  const [tx, tz] = pathTangent(points, index);
  const [wx, wz] = points[index];
  // The vehicle's world forward is -Z; yaw rotates it onto the tangent.
  const yaw = Math.atan2(-tx, -tz);
  return {
    position: [wx, ROAD_RAISE + 0.8, wz],
    yaw,
  };
}

export async function buildProceduralWorld(
  dataUrl: string,
  parsed: ParsedSketch,
): Promise<ProceduralWorldDescriptor> {
  const worldSize = PROCEDURAL_WORLD_SIZE;
  const { grid } = parsed;

  let rawPath = parsed.roadPath.map(([x, y]) => gridToWorld(x, y, grid, worldSize));
  if (rawPath.length < 4) {
    rawPath = defaultRoadPath(worldSize);
  }
  // Extra smoothing pass keeps the road's layout while removing the coarse
  // parser's grid steps; the resample then densifies corners smoothly.
  let roadPoints = smoothPath(rawPath, 3);
  roadPoints = resamplePath(roadPoints, 1.1);

  // Road width from the drawn stroke thickness (in cells -> world metres).
  const widthCells = Math.max(2.5, parsed.roadWidthCells || 6);
  const roadWidth = Math.min(
    18,
    Math.max(6, (widthCells / grid) * worldSize),
  );

  // Orient each ramp so its low edge faces the nearest road point.
  const nearestRoadYaw = (wx: number, wz: number): number => {
    let bestX = 0;
    let bestZ = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < roadPoints.length; i++) {
      const [px, pz] = roadPoints[i];
      const d = Math.hypot(px - wx, pz - wz);
      if (d < bestDistance) {
        bestDistance = d;
        bestX = px;
        bestZ = pz;
      }
    }
    const dx = bestX - wx;
    const dz = bestZ - wz;
    return Math.atan2(-dx, -dz);
  };

  const ramps = parsed.ramps.map(({ x, y }) => {
    const [wx, wz] = gridToWorld(x, y, grid, worldSize);
    return {
      position: [wx, ROAD_RAISE, wz] as [number, number, number],
      width: 9,
      depth: 11,
      height: 2.6,
      yaw: nearestRoadYaw(wx, wz),
    };
  });

  // Building footprints reflect the drawn shape (clamped 4-25 m), with a
  // modest deterministic height.
  const buildings = parsed.buildings.map(
    ({ x, y, widthCells, heightCells }) => {
      const [wx, wz] = gridToWorld(x, y, grid, worldSize);
      const toMeters = (cells: number) =>
        Math.min(25, Math.max(4, (cells / grid) * worldSize));
      const hash = Math.abs(Math.round(wx * 12.9898 + wz * 78.233) % 7);
      return {
        position: [wx, 0, wz] as [number, number, number],
        size: [
          toMeters(widthCells),
          4 + hash,
          toMeters(heightCells),
        ] as [number, number, number],
        yaw: 0,
      };
    },
  );

  const trees = parsed.trees.map(({ x, y }) => {
    const [wx, wz] = gridToWorld(x, y, grid, worldSize);
    return {
      position: [wx, 0, wz] as [number, number, number],
      scale: 0.8 + Math.random() * 0.6,
    };
  });

  // Spawns sit on the road: player ahead, police ~12 m behind along the path.
  const totalLength = Math.max(1, roadPoints.length * 1.6);
  const player = spawnAlongPath(roadPoints, SPAWN_PLAYER_ALONG);
  const police = spawnAlongPath(
    roadPoints,
    Math.max(
      0,
      SPAWN_PLAYER_ALONG - SPAWN_POLICE_BEHIND_M / totalLength,
    ),
  );

  return {
    kind: "procedural",
    worldId: `local-${Date.now().toString(36)}`,
    caption: "A forged world built from your sketch.",
    worldSize,
    road: { points: roadPoints, width: roadWidth },
    ramps,
    buildings,
    trees,
    spawns: { player, police },
    halfExtent: worldSize / 2,
  };
}