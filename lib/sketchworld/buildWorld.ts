/**
 * Procedural world descriptor and builder.
 *
 * The parsed sketch is converted into a flat, stylized, playable world.
 * The primary supported road style is a ROAD CORRIDOR: the space between
 * an outer and an inner black boundary. A stroke-path fallback is kept for
 * simple thick-stroke drawings.
 */

import type { ParsedSketch } from "./parseSketch";

export interface RoadCorridor {
  /** Corridor outer edge (world XZ). */
  outer: Array<[number, number]>;
  /** Corridor inner edge (world XZ), the road's hole. */
  inner: Array<[number, number]>;
}

export interface ProceduralWorldDescriptor {
  kind: "procedural";
  worldId: string;
  caption: string;
  /** World footprint in metres (square). */
  worldSize: number;
  /**
   * Road centerline in world XZ (used for markings and spawns). When the
   * corridor form is present the asphalt covers the whole corridor area.
   */
  road: {
    points: Array<[number, number]>;
    width: number;
    corridor: RoadCorridor | null;
  };
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

  let corridor: RoadCorridor | null = null;
  let roadPoints: Array<[number, number]> = [];
  let roadWidth = 8;

  if (parsed.outerContour.length >= 4 && parsed.innerContour.length >= 4) {
    // Corridor road: the asphalt is the area between the two boundaries.
    const outerRaw = parsed.outerContour.map(([x, y]) =>
      gridToWorld(x, y, grid, worldSize),
    );
    const innerRaw = parsed.innerContour.map(([x, y]) =>
      gridToWorld(x, y, grid, worldSize),
    );
    corridor = {
      outer: smoothPath(outerRaw, 2),
      inner: smoothPath(innerRaw, 2),
    };
    const centerRaw = parsed.centerline.map(([x, y]) =>
      gridToWorld(x, y, grid, worldSize),
    );
    roadPoints = resamplePath(smoothPath(centerRaw, 2), 1.1);
    if (roadPoints.length < 4) {
      roadPoints = defaultRoadPath(worldSize);
      corridor = null;
    }
  } else {
    // Stroke-path fallback.
    let rawPath = parsed.strokePath.map(([x, y]) =>
      gridToWorld(x, y, grid, worldSize),
    );
    if (rawPath.length < 4) {
      rawPath = defaultRoadPath(worldSize);
    }
    roadPoints = resamplePath(smoothPath(rawPath, 3), 1.1);
    const widthCells = Math.max(2.5, parsed.strokeWidthCells || 6);
    roadWidth = Math.min(18, Math.max(6, (widthCells / grid) * worldSize));
  }

  // Props are intentionally disabled for the corridor road style: residual
  // black components are road boundaries, not buildings.
  const ramps: ProceduralWorldDescriptor["ramps"] = [];
  const buildings: ProceduralWorldDescriptor["buildings"] = [];
  const trees: ProceduralWorldDescriptor["trees"] = [];

  // Spawns sit on the road centerline: player ahead, police ~12 m behind.
  const totalLength = Math.max(1, roadPoints.length * 1.1);
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
    road: { points: roadPoints, width: roadWidth, corridor },
    ramps,
    buildings,
    trees,
    spawns: { player, police },
    halfExtent: worldSize / 2,
  };
}