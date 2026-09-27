/**
 * Procedural world descriptor and builder.
 *
 * The parsed sketch is converted into a flat, stylized, playable world.
 * The primary supported road style is a ROAD CORRIDOR: the space between
 * an outer and an inner black boundary. A stroke-path fallback is kept for
 * simple thick-stroke drawings.
 */

import type { ParsedSketch } from "./parseSketch";
import type { WorldTextureSource } from "./buildWorldTexture";
import { semanticPointToWorld } from "./worldTransform";

export interface ProceduralWorldDescriptor {
  kind: "procedural";
  worldId: string;
  caption: string;
  /** World footprint in metres (square). */
  worldSize: number;
  /**
   * Road centerline in world XZ (markings + spawns). The visual road is a
   * texture painted from the parsed road mask.
   */
  road: {
    points: Array<[number, number]>;
    width: number;
  };
  /** Source data for the single visual terrain texture. */
  roadTexture: WorldTextureSource | null;
  /** Semantic props (buildings, water, vegetation, ramps) from the
      AI-normalized map, when that path was used. */
  semantic?: SemanticWorldProps | null;
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
/**
 * The playable reset bounds extend beyond the boundary walls (which sit at
 * worldSize/2 + wall thickness). The vehicle auto-reset must only catch
 * genuine escapes/falls - never the normal drivable arena.
 */
const PLAYABLE_HALF_EXTENT = PROCEDURAL_WORLD_SIZE / 2 + 15;
const ROAD_RAISE = 0.07;
const SPAWN_PLAYER_ALONG = 0.35;
const SPAWN_POLICE_BEHIND_M = 12;
/** Road coverage bounds for a valid Forge map (fraction of the map). */
const MIN_ROAD_COVERAGE = 0.03;
const MAX_ROAD_COVERAGE = 0.7;

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

/** Deterministic 0..1 hash used to seed placement randomization. */
function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
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

  // Road centerline (corridor or stroke fallback) in world coordinates.
  let centerRaw = parsed.centerline.map(([x, y]) =>
    gridToWorld(x, y, grid, worldSize),
  );
  if (centerRaw.length < 4) {
    centerRaw = defaultRoadPath(worldSize);
  }
  const roadPoints = resamplePath(smoothPath(centerRaw, 2), 1.1);

  // Fail-closed validation: the road area must exist and the spawns must be
  // on the road. Otherwise the world is not declared ready.
  let roadPixels = 0;
  for (let i = 0; i < parsed.roadMask.length; i++) {
    if (parsed.roadMask[i] === 1) {
      roadPixels++;
    }
  }
  const roadCoverage = roadPixels / (grid * grid);
  const pointInRoad = (x: number, z: number): boolean => {
    const gx = Math.min(
      grid - 1,
      Math.max(0, Math.round(((x / worldSize) + 0.5) * (grid - 1))),
    );
    const gy = Math.min(
      grid - 1,
      Math.max(0, Math.round(((z / worldSize) + 0.5) * (grid - 1))),
    );
    return parsed.roadMask[gy * grid + gx] === 1;
  };

  if (roadCoverage < MIN_ROAD_COVERAGE || roadCoverage > MAX_ROAD_COVERAGE) {
    throw new Error(
      "Couldn't build a clean road from this sketch. Try closing both road boundaries.",
    );
  }

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
  if (!pointInRoad(player.position[0], player.position[2]) ||
      !pointInRoad(police.position[0], police.position[2])) {
    throw new Error(
      "Couldn't build a clean road from this sketch. Try closing both road boundaries.",
    );
  }

  const roadTexture: WorldTextureSource = {
    roadMask: parsed.roadMask,
    grid,
    centerline: parsed.centerline,
    corridorValid: parsed.corridorValid,
  };

  // Props are intentionally disabled for the road-first release: residual
  // black components are road boundaries, not buildings.
  const ramps: ProceduralWorldDescriptor["ramps"] = [];
  const buildings: ProceduralWorldDescriptor["buildings"] = [];
  const trees: ProceduralWorldDescriptor["trees"] = [];

  return {
    kind: "procedural",
    worldId: `local-${Date.now().toString(36)}`,
    caption: "A forged world built from your sketch.",
    worldSize,
    road: { points: roadPoints, width: 8 },
    roadTexture,
    ramps,
    buildings,
    trees,
    spawns: { player, police },
    halfExtent: PLAYABLE_HALF_EXTENT,
  };
}
export interface SemanticBuilding {
  position: [number, number, number];
  size: [number, number, number];
  yaw: number;
  /** Deterministic variant seed (index into the building variants). */
  variant: number;
  /** Semantic-grid centroid (for dev diagnostics). */
  semantic: [number, number];
}

export interface SemanticTree {
  position: [number, number, number];
  /** Deterministic variant seed (index into the tree variants). */
  variant: number;
  /** Target height in metres (3-8 m band). */
  targetHeight: number;
  /** Per-tree jitter multiplier on the fitted scale. */
  scale: number;
  /** Semantic-grid position (for dev diagnostics). */
  semantic: [number, number];
}

export interface SemanticRamp {
  position: [number, number, number];
  width: number;
  depth: number;
  height: number;
  yaw: number;
  /** Semantic-grid centroid (for dev diagnostics). */
  semantic: [number, number];
}

export interface SemanticWorldProps {
  buildings: SemanticBuilding[];
  waterMask: Uint8Array | null;
  waterContour: Array<[number, number]> | null;
  vegetation: SemanticTree[];
  ramps: SemanticRamp[];
  vegetationRegions: number;
  buildingRegions: number;
  rampRegions: number;
  waterRegionCount: number;
}

/** Minimum semantic prop region area (cells), mirrors parseNormalizedMap. */
const MIN_SEMANTIC_REGION_AREA = 12;
/** Semantic class indices (must match quantizeSemanticMap palette order). */
const VEGETATION_CLASS = 5;

interface SemanticRegion {
  pixels: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Connected components of one semantic class, with the member pixels. */
function semanticRegions(
  classes: Uint8Array,
  grid: number,
  semanticClass: number,
): SemanticRegion[] {
  const labels = new Int32Array(grid * grid).fill(-1);
  const stack: number[] = [];
  const regions: SemanticRegion[] = [];
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const index = y * grid + x;
      if (classes[index] !== semanticClass || labels[index] !== -1) {
        continue;
      }
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const pixels: number[] = [];
      labels[index] = regions.length;
      stack.push(index);
      while (stack.length > 0) {
        const current = stack.pop()!;
        const cx = current % grid;
        const cy = (current / grid) | 0;
        pixels.push(current);
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) {
              continue;
            }
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) {
              continue;
            }
            const nIndex = ny * grid + nx;
            if (classes[nIndex] === semanticClass && labels[nIndex] === -1) {
              labels[nIndex] = regions.length;
              stack.push(nIndex);
            }
          }
        }
      }
      regions.push({ pixels, minX, maxX, minY, maxY });
    }
  }
  return regions;
}

/** Deterministic tree count for a vegetation region (small/medium/large). */
function treeCountForArea(areaCells: number, seed: number): number {
  const base = areaCells < 150 ? 2 : areaCells < 700 ? 5 : 9;
  const spread = base === 2 ? 1 : base === 5 ? 2 : 3;
  return Math.max(
    1,
    base - spread + Math.floor(hash01(seed * 7 + 13) * (spread * 2 + 1)),
  );
}

/** Picks `count` interior pixels from a region deterministically. */
function sampleRegionPixels(
  pixels: number[],
  count: number,
  seed: number,
): number[] {
  if (pixels.length <= count) {
    return pixels;
  }
  const out: number[] = [];
  const step = pixels.length / count;
  for (let i = 0; i < count; i++) {
    const offset = Math.floor(hash01(seed * 31 + i * 3) * 0.8);
    const index = Math.min(
      pixels.length - 1,
      Math.floor((i + offset) * step),
    );
    out.push(pixels[index]);
  }
  return out;
}

/**
 * Builds the world descriptor from an AI-normalized semantic layout.
 * The road mask and centerline are authoritative; semantic regions become
 * deterministic low-poly props.
 */
export async function buildProceduralWorldFromNormalized(
  layout: {
    roadMask: Uint8Array;
    grid: number;
    centerline: Array<[number, number]>;
    classes: Uint8Array;
    buildings: Array<{
      x: number;
      y: number;
      widthCells: number;
      heightCells: number;
    }>;
    waterMask: Uint8Array;
    vegetation: Array<{
      x: number;
      y: number;
      widthCells: number;
      heightCells: number;
    }>;
    ramps: Array<{
      x: number;
      y: number;
      widthCells: number;
      heightCells: number;
    }>;
  },
): Promise<ProceduralWorldDescriptor> {
  const worldSize = PROCEDURAL_WORLD_SIZE;
  const { grid } = layout;

  const toMeters = (cells: number) =>
    Math.min(25, Math.max(4, (cells / grid) * worldSize));

  const roadPoints = resamplePath(
    smoothPath(
      layout.centerline.map(([x, y]) => gridToWorld(x, y, grid, worldSize)),
      2,
    ),
    1.1,
  );

  const player = spawnAlongPath(roadPoints, SPAWN_PLAYER_ALONG);
  const totalLength = Math.max(1, roadPoints.length * 1.1);
  const police = spawnAlongPath(
    roadPoints,
    Math.max(0, SPAWN_PLAYER_ALONG - SPAWN_POLICE_BEHIND_M / totalLength),
  );

  const pointInRoad = (x: number, z: number): boolean => {
    const gx = Math.min(
      grid - 1,
      Math.max(0, Math.round(((x / worldSize) + 0.5) * (grid - 1))),
    );
    const gy = Math.min(
      grid - 1,
      Math.max(0, Math.round(((z / worldSize) + 0.5) * (grid - 1))),
    );
    return layout.roadMask[gy * grid + gx] === 1;
  };
  if (
    !pointInRoad(player.position[0], player.position[2]) ||
    !pointInRoad(police.position[0], police.position[2])
  ) {
    throw new Error("Normalized map spawns are not on the road.");
  }

  // --- Buildings: ONE logical region -> ONE building -------------------------
  // Each region gets its centroid, footprint, variant seed and a 0 yaw; the
  // renderer aligns the model's long axis to the region aspect.
  const buildings: SemanticBuilding[] = layout.buildings.map(
    ({ x, y, widthCells, heightCells }, index) => {
      const [wx, wz] = semanticPointToWorld(x, y, grid, grid, worldSize);
      const hash = Math.abs(
        Math.round(wx * 12.9898 + wz * 78.233) % 7,
      );
      return {
        position: [wx, 0, wz] as [number, number, number],
        size: [
          toMeters(widthCells),
          4 + hash,
          toMeters(heightCells),
        ] as [number, number, number],
        yaw: 0,
        variant: index,
        semantic: [x, y],
      };
    },
  );

  // --- Vegetation: sample a LIMITED number of points INSIDE each region ----
  const vegetationRegions = semanticRegions(
    layout.classes,
    grid,
    VEGETATION_CLASS,
  ).filter((region) => region.pixels.length >= MIN_SEMANTIC_REGION_AREA);

  const vegetation: SemanticTree[] = [];
  vegetationRegions.forEach((region, regionIndex) => {
    const count = treeCountForArea(region.pixels.length, regionIndex);
    const sampled = sampleRegionPixels(
      region.pixels,
      count,
      regionIndex,
    );
    sampled.forEach((cell, treeIndex) => {
      const cx = cell % grid;
      const cy = (cell / grid) | 0;
      const [wx, wz] = semanticPointToWorld(cx, cy, grid, grid, worldSize);
      const seed = regionIndex * 1000 + treeIndex;
      vegetation.push({
        position: [wx, 0, wz] as [number, number, number],
        variant: seed,
        targetHeight: 3 + hash01(seed * 11 + 5) * 5,
        scale: 0.85 + hash01(seed * 17 + 3) * 0.3,
        semantic: [cx, cy],
      });
    });
  });

  // --- Ramps: ONE region -> ONE ramp, low side facing the road --------------
  const ramps: SemanticRamp[] = layout.ramps.map(({ x, y }) => {
    const [wx, wz] = semanticPointToWorld(x, y, grid, grid, worldSize);
    // Nearest road centerline point in GRID space, so the tangent is
    // computed in the same coordinate frame as the ramp centroid.
    let bestX = 0;
    let bestY = 0;
    let bestDistance = Infinity;
    for (const [px, py] of layout.centerline) {
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < bestDistance) {
        bestDistance = d;
        bestX = px;
        bestY = py;
      }
    }
    const yaw = Math.atan2(-(bestX - x), -(bestY - y));
    return {
      position: [wx, ROAD_RAISE, wz] as [number, number, number],
      width: 9,
      depth: 11,
      height: 2.6,
      yaw,
      semantic: [x, y],
    };
  });

  const waterRegionCount = semanticRegions(
    layout.classes,
    grid,
    3,
  ).filter((region) => region.pixels.length >= MIN_SEMANTIC_REGION_AREA).length;

  const semantic: SemanticWorldProps = {
    buildings,
    waterMask: layout.waterMask,
    waterContour: null,
    vegetation,
    ramps,
    vegetationRegions: vegetationRegions.length,
    buildingRegions: buildings.length,
    rampRegions: ramps.length,
    waterRegionCount,
  };

  return {
    kind: "procedural",
    worldId: `ai-${Date.now().toString(36)}`,
    caption: "A forged world built from your sketch.",
    worldSize,
    road: { points: roadPoints, width: 8 },
    roadTexture: {
      roadMask: layout.roadMask,
      grid,
      centerline: layout.centerline,
      corridorValid: true,
      semanticClasses: layout.classes,
    },
    semantic,
    ramps,
    buildings,
    trees: vegetation,
    spawns: { player, police },
    halfExtent: PLAYABLE_HALF_EXTENT,
  };
}
