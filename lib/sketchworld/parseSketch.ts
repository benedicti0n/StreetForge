/**
 * Deterministic, color-aware sketch parsing.
 *
 * Each downsampled pixel is classified into ONE semantic class first
 * (water > vegetation > road > building), then connected components and
 * shape heuristics convert the masks into world features. This is a
 * controlled drawing language, not a general vision system.
 */

export const PARSE_GRID = 128;
export const MIN_FEATURE_AREA = 4;
/** Compact dark blobs below this area are ramps. */
export const RAMP_MAX_AREA = 60;
/** Compact dark blobs at or above this area are buildings-on-road leftovers. */
export const SOLID_FILL_RATIO = 0.5;

export type SketchSemantic =
  | "background"
  | "road"
  | "building"
  | "water"
  | "vegetation";

export interface ParsedSketch {
  grid: number;
  darkness: Float32Array;
  roadPath: Array<[number, number]>;
  roadWidthCells: number;
  ramps: Array<{ x: number; y: number }>;
  buildings: Array<{
    x: number;
    y: number;
    widthCells: number;
    heightCells: number;
  }>;
  waterPath: Array<[number, number]>;
  waterWidthCells: number;
  vegetation: Array<{ x: number; y: number }>;
}

function decodeImageToGrid(
  dataUrl: string,
  grid: number,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = grid;
        canvas.height = grid;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          reject(new Error("Canvas 2D is unavailable."));
          return;
        }
        context.drawImage(image, 0, 0, grid, grid);
        resolve({
          data: context.getImageData(0, 0, grid, grid).data,
          width: grid,
          height: grid,
        });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Failed to decode the sketch."));
    image.src = dataUrl;
  });
}

/**
 * Color classification thresholds (tolerant, HSV-style).
 * A pixel gets exactly ONE semantic class; precedence: water > vegetation
 * > road > building.
 */
function classifyPixel(r: number, g: number, b: number): SketchSemantic {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const sat = max === 0 ? 0 : (max - min) / max;

  let hue = 0;
  if (sat > 0) {
    const delta = max - min;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  if (sat > 0.16) {
    // Blue/cyan water (including darker blues and antialiased edges).
    if (hue >= 185 && hue <= 275 && b > r + 12) {
      return "water";
    }
    // Green vegetation.
    if (hue >= 70 && hue <= 170 && g > r + 10 && g > b + 10) {
      return "vegetation";
    }
  }
  // Near-black road (below the color checks so colored marks never fall in).
  if (luma < 0.35) {
    return "road";
  }
  // Neutral gray building (low saturation, mid luminance). The near-white
  // map background (luma ~0.95) and the black road are excluded.
  if (sat < 0.13 && luma >= 0.36 && luma <= 0.86) {
    return "building";
  }
  return "background";
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

/**
 * Greedy centerline walk over a semantic mask blob (roads and water share
 * this path extraction).
 */
function extractPath(
  mask: Uint8Array,
  labels: Int32Array,
  label: number,
  grid: number,
): Array<[number, number]> {
  const visited = new Uint8Array(grid * grid);
  const neighbours = (cx: number, cy: number) => {
    const out: Array<{ x: number; y: number }> = [];
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
        const index = ny * grid + nx;
        if (labels[index] === label && visited[index] === 0) {
          out.push({ x: nx, y: ny });
        }
      }
    }
    return out;
  };

  let seed = -1;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === label) {
      seed = i;
      break;
    }
  }
  if (seed === -1) {
    return [];
  }
  const seedX = seed % grid;
  const seedY = (seed / grid) | 0;

  const forward: Array<[number, number]> = [[seedX, seedY]];
  visited[seed] = 1;

  const walk = (heading: number, out: Array<[number, number]>) => {
    let cx = seedX;
    let cy = seedY;
    let h = heading;
    let prevX = seedX - Math.cos(h);
    let prevY = seedY - Math.sin(h);
    for (let step = 0; step < grid * grid; step++) {
      const candidates = neighbours(cx, cy);
      if (candidates.length === 0) {
        break;
      }
      candidates.sort((a, b) => {
        const angleA = Math.atan2(a.y - cy, a.x - cx);
        const angleB = Math.atan2(b.y - cy, b.x - cx);
        let deltaA = Math.abs(angleA - h);
        let deltaB = Math.abs(angleB - h);
        if (deltaA > Math.PI) deltaA = Math.PI * 2 - deltaA;
        if (deltaB > Math.PI) deltaB = Math.PI * 2 - deltaB;
        return deltaA - deltaB;
      });
      const next = candidates[0];
      cx = next.x;
      cy = next.y;
      visited[cy * grid + cx] = 1;
      out.push([cx, cy]);
      h = Math.atan2(cy - prevY, cx - prevX);
      prevX = cx;
      prevY = cy;
    }
  };

  const first = neighbours(seedX, seedY);
  if (first.length > 0) {
    const initialHeading = Math.atan2(
      first[0].y - seedY,
      first[0].x - seedX,
    );
    walk(initialHeading, forward);
    // Reverse pass from the seed toward the other side (loops/curves).
    const visitedClone = new Uint8Array(visited);
    visited.fill(0);
    for (let i = 0; i < visitedClone.length; i++) {
      visited[i] = visitedClone[i];
    }
    let reverseHeading = initialHeading + Math.PI;
    if (reverseHeading > Math.PI) reverseHeading -= Math.PI * 2;
    const reverse: Array<[number, number]> = [];
    walk(reverseHeading, reverse);
    reverse.reverse();
    return [...reverse, ...forward.slice(1)];
  }
  return forward;
}

export async function parseSketch(dataUrl: string): Promise<ParsedSketch> {
  const { data, width } = await decodeImageToGrid(dataUrl, PARSE_GRID);
  const grid = width;
  const darkness = new Float32Array(grid * grid);
  const masks: Record<Exclude<SketchSemantic, "background">, Uint8Array> = {
    road: new Uint8Array(grid * grid),
    building: new Uint8Array(grid * grid),
    water: new Uint8Array(grid * grid),
    vegetation: new Uint8Array(grid * grid),
  };

  for (let i = 0; i < grid * grid; i++) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    darkness[i] =
      1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const semantic = classifyPixel(r, g, b);
    if (semantic !== "background") {
      masks[semantic][i] = 1;
    }
  }

  const road = connectedComponents(masks.road, grid);
  const building = connectedComponents(masks.building, grid);
  const water = connectedComponents(masks.water, grid);
  const vegetation = connectedComponents(masks.vegetation, grid);

  // ROAD: the dominant dark component; other compact dark blobs are ramps.
  let roadPath: Array<[number, number]> = [];
  let roadWidthCells = 0;
  const ramps: Array<{ x: number; y: number }> = [];
  let roadLabel = -1;
  let roadArea = 0;
  for (let label = 0; label < road.counts.length; label++) {
    if (road.counts[label] > roadArea) {
      roadArea = road.counts[label];
      roadLabel = label;
    }
  }
  if (roadLabel !== -1) {
    const path = extractPath(masks.road, road.labels, roadLabel, grid);
    if (path.length >= 2) {
      roadPath = path;
      roadWidthCells = Math.max(2, roadArea / path.length);
    }
  }
  for (let label = 0; label < road.counts.length; label++) {
    if (label === roadLabel || road.counts[label] < MIN_FEATURE_AREA) {
      continue;
    }
    const box = road.bounds[label];
    const boxW = box.maxX - box.minX + 1;
    const boxH = box.maxY - box.minY + 1;
    const fill = road.counts[label] / (boxW * boxH);
    if (fill >= SOLID_FILL_RATIO && road.counts[label] < RAMP_MAX_AREA) {
      ramps.push({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
    }
  }

  // BUILDINGS: gray components resembling outlined or filled rectangles.
  const buildings: ParsedSketch["buildings"] = [];
  for (let label = 0; label < building.counts.length; label++) {
    const box = building.bounds[label];
    const boxW = box.maxX - box.minX + 1;
    const boxH = box.maxY - box.minY + 1;
    if (boxW < 3 || boxH < 3) {
      continue;
    }
    if (boxW / boxH > 6 || boxH / boxW > 6) {
      continue;
    }
    const bboxArea = boxW * boxH;
    const fill = building.counts[label] / bboxArea;
    // Perimeter coverage: how much of the rectangle outline is drawn.
    let perimeterPixels = 0;
    const perimeter = 2 * (boxW + boxH);
    for (let y = box.minY; y <= box.maxY; y++) {
      for (let x = box.minX; x <= box.maxX; x++) {
        const index = y * grid + x;
        const onEdge =
          x === box.minX || x === box.maxX || y === box.minY || y === box.maxY;
        if (building.labels[index] === label && onEdge) {
          perimeterPixels += 1;
        }
      }
    }
    const coverage = perimeterPixels / perimeter;
    // Outlined rectangles (perimeter-dominant) or filled compact blocks.
    if (coverage < 0.35 && fill < 0.4) {
      continue;
    }
    buildings.push({
      x: (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
      widthCells: boxW,
      heightCells: boxH,
    });
  }

  // WATER: the largest blue component becomes a buffered ribbon path.
  let waterPath: Array<[number, number]> = [];
  let waterWidthCells = 0;
  let waterLabel = -1;
  let waterArea = 0;
  for (let label = 0; label < water.counts.length; label++) {
    if (water.counts[label] > waterArea) {
      waterArea = water.counts[label];
      waterLabel = label;
    }
  }
  if (waterLabel !== -1 && waterArea >= MIN_FEATURE_AREA * 2) {
    const path = extractPath(masks.water, water.labels, waterLabel, grid);
    if (path.length >= 2) {
      waterPath = path;
      waterWidthCells = Math.max(3, waterArea / path.length);
    }
  }

  // VEGETATION: cluster points sampled deterministically per component.
  const vegetationOut: Array<{ x: number; y: number }> = [];
  let clusterSeed = 7;
  for (let label = 0; label < vegetation.counts.length; label++) {
    if (vegetation.counts[label] < MIN_FEATURE_AREA) {
      continue;
    }
    const vBox = vegetation.bounds[label];
    const cx = (vBox.minX + vBox.maxX) / 2;
    const cy = (vBox.minY + vBox.maxY) / 2;
    const count = Math.min(
      12,
      Math.max(1, Math.round(vegetation.counts[label] / 18)),
    );
    const spread = Math.max(1, (vBox.maxX - vBox.minX + 1) / 2);
    for (let i = 0; i < count; i++) {
      clusterSeed = (clusterSeed * 16807) % 2147483647;
      const angle = i * 2.39996 + (clusterSeed % 100) / 100;
      const radius = (((clusterSeed * 13) % 100) / 100) * spread;
      vegetationOut.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.info(
      "[streetforge] forge parse",
      JSON.stringify({
        road: roadPath.length >= 2 ? 1 : 0,
        buildings: buildings.length,
        water: waterPath.length >= 2 ? 1 : 0,
        vegetation: vegetationOut.length,
        ramps: ramps.length,
      }),
    );
  }

  return {
    grid,
    darkness,
    roadPath,
    roadWidthCells,
    ramps,
    buildings,
    waterPath,
    waterWidthCells,
    vegetation: vegetationOut,
  };
}
