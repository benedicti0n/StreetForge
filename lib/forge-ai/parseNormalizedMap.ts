/**
 * Parser for AI-normalized semantic forge maps.
 *
 * Unlike the hand-sketch parser, no boundary inference is needed: the AI
 * has already resolved the road into a filled region. Every quantized
 * class maps directly to geometry.
 */

import { walkMedial } from "@/lib/sketchworld/parseSketch";
import type { SemanticClass } from "./palette";

export const SEMANTIC_GRID = 256;
/** Road coverage bounds for a valid normalized map. */
export const MIN_ROAD_COVERAGE = 0.02;
export const MAX_ROAD_COVERAGE = 0.6;
/** The largest road component must hold at least this share of road pixels. */
export const ROAD_MAJORITY = 0.75;
/** Minimum component area for semantic props. */
export const MIN_PROP_AREA = 12;

export interface NormalizedSemanticRegion {
  x: number;
  y: number;
  widthCells: number;
  heightCells: number;
}

export interface NormalizedWorldLayout {
  grid: number;
  /** Road mask (1 = drivable road). */
  roadMask: Uint8Array;
  /** Road centerline in grid coordinates. */
  centerline: Array<[number, number]>;
  /** Semantic class per pixel (quantized map). */
  classes: Uint8Array;
  buildings: NormalizedSemanticRegion[];
  waterMask: Uint8Array;
  vegetation: NormalizedSemanticRegion[];
  ramps: NormalizedSemanticRegion[];
  roadCoverage: number;
  roadConnectivity: number;
}

function connectedComponents(
  mask: Uint8Array,
  grid: number,
): {
  labels: Int32Array;
  counts: number[];
  bounds: Array<{ minX: number; minY: number; maxX: number; maxY: number }>;
} {
  const labels = new Int32Array(mask.length).fill(-1);
  const counts: number[] = [];
  const bounds: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];
  const stack: number[] = [];
  let nextLabel = 0;
  const inBounds = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < grid && y < grid;
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const index = y * grid + x;
      if (mask[index] === 0 || labels[index] !== -1) {
        continue;
      }
      const label = nextLabel++;
      labels[index] = label;
      let count = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      stack.push(index);
      while (stack.length > 0) {
        const current = stack.pop()!;
        const cx = current % grid;
        const cy = (current / grid) | 0;
        count += 1;
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
            if (!inBounds(nx, ny)) {
              continue;
            }
            const nIndex = ny * grid + nx;
            if (mask[nIndex] !== 0 && labels[nIndex] === -1) {
              labels[nIndex] = label;
              stack.push(nIndex);
            }
          }
        }
      }
      counts.push(count);
      bounds.push({ minX, minY, maxX, maxY });
    }
  }
  return { labels, counts, bounds };
}

/** Morphological close to fuse tiny antialiasing gaps in the road. */
function closeRoad(mask: Uint8Array, grid: number): Uint8Array {
  const dilated = new Uint8Array(grid * grid);
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      if (mask[y * grid + x] === 0) {
        continue;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < grid && ny < grid) {
            dilated[ny * grid + nx] = 1;
          }
        }
      }
    }
  }
  const eroded = new Uint8Array(grid * grid);
  for (let y = 1; y < grid - 1; y++) {
    for (let x = 1; x < grid - 1; x++) {
      if (
        dilated[y * grid + x] === 1 &&
        dilated[y * grid + x - 1] === 1 &&
        dilated[y * grid + x + 1] === 1 &&
        dilated[(y - 1) * grid + x] === 1 &&
        dilated[(y + 1) * grid + x] === 1
      ) {
        eroded[y * grid + x] = 1;
      }
    }
  }
  return eroded;
}

/**
 * Parses a quantized semantic map into a validated world layout.
 * Throws when the road fails validation (the caller falls back to the
 * local Forge parser).
 */
export function parseNormalizedMap(
  classes: Uint8Array,
  grid: number,
): NormalizedWorldLayout {
  // Class indices MUST stay in sync with SEMANTIC_CLASSES order in
  // palette.ts (the quantizer writes palette order): road=1, shoulder=2,
  // water=3, building=4, vegetation=5, ramp=6. RED pixels are quantized to
  // "building" and ORANGE/YELLOW to "ramp" by hue rules in the quantizer,
  // so a red component can never arrive here as a ramp.
  const classIndex = {
    road: 1,
    shoulder: 2,
    water: 3,
    building: 4,
    vegetation: 5,
    ramp: 6,
  } as const;

  // Road mask.
  let roadMask: Uint8Array = new Uint8Array(grid * grid);
  let roadPixels = 0;
  for (let i = 0; i < grid * grid; i++) {
    if (classes[i] === classIndex.road) {
      roadMask[i] = 1;
      roadPixels++;
    }
  }
  roadMask = closeRoad(roadMask, grid);

  const roadCoverage = roadPixels / (grid * grid);
  if (roadCoverage < MIN_ROAD_COVERAGE || roadCoverage > MAX_ROAD_COVERAGE) {
    throw new Error("Normalized road coverage is invalid.");
  }

  // Connectivity: the largest component must dominate.
  const roadComponents = connectedComponents(roadMask, grid);
  let largestRoad = 0;
  for (let label = 0; label < roadComponents.counts.length; label++) {
    if (roadComponents.counts[label] > largestRoad) {
      largestRoad = roadComponents.counts[label];
    }
  }
  const roadConnectivity =
    roadPixels > 0 ? largestRoad / Math.max(1, roadPixels) : 0;
  if (roadConnectivity < ROAD_MAJORITY) {
    throw new Error("Normalized road is not connected.");
  }

  // Centerline from the road mask (medial walk).
  const centerline = walkMedial(roadMask, grid);

  // Semantic regions.
  const regionOf = (semantic: SemanticClass): NormalizedSemanticRegion[] => {
    const index = classIndex[semantic as keyof typeof classIndex];
    if (index === undefined) {
      return [];
    }
    const mask = new Uint8Array(grid * grid);
    for (let i = 0; i < grid * grid; i++) {
      if (classes[i] === index) {
        mask[i] = 1;
      }
    }
    const comps = connectedComponents(mask, grid);
    const out: NormalizedSemanticRegion[] = [];
    for (let label = 0; label < comps.counts.length; label++) {
      if (comps.counts[label] < MIN_PROP_AREA) {
        continue;
      }
      const box = comps.bounds[label];
      out.push({
        x: (box.minX + box.maxX) / 2,
        y: (box.minY + box.maxY) / 2,
        widthCells: box.maxX - box.minX + 1,
        heightCells: box.maxY - box.minY + 1,
      });
    }
    return out;
  };

  const waterMask = new Uint8Array(grid * grid);
  for (let i = 0; i < grid * grid; i++) {
    if (classes[i] === classIndex.water) {
      waterMask[i] = 1;
    }
  }

  return {
    grid,
    roadMask,
    centerline,
    classes,
    buildings: regionOf("building"),
    waterMask,
    vegetation: regionOf("vegetation"),
    ramps: regionOf("ramp"),
    roadCoverage,
    roadConnectivity,
  };
}