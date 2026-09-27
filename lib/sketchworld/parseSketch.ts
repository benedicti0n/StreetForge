/**
 * Deterministic, demo-oriented sketch parsing.
 *
 * The captured editor image is downsampled to a small grid and analysed
 * with simple heuristics: dark strokes become a road path, solid compact
 * blobs become ramps or buildings, scribble blobs become tree clusters.
 * This is intentionally not a general vision system - it is a controlled
 * parser tuned for the StreetForge drawing language.
 */

export const PARSE_GRID = 128;
/** Cell darkness above which a pixel counts as drawn (0..1). */
export const DARK_THRESHOLD = 0.45;
/** Minimum blob area (cells) to be considered a feature. */
export const MIN_FEATURE_AREA = 4;
/** Compact blobs below this area are ramps. */
export const RAMP_MAX_AREA = 60;
/** Compact blobs at or above this area are buildings. */
export const BUILDING_MIN_AREA = 60;
/** Fill ratio above which a blob counts as a solid shape. */
export const SOLID_FILL_RATIO = 0.5;

export interface ParsedSketch {
  grid: number;
  /** Cell darkness 0..1 indexed [y * grid + x]. */
  darkness: Float32Array;
  /** Road centerline in grid coordinates (row, col), from first to last. */
  roadPath: Array<[number, number]>;
  /** Average road width in grid cells. */
  roadWidthCells: number;
  ramps: Array<{ x: number; y: number }>;
  buildings: Array<{ x: number; y: number }>;
  trees: Array<{ x: number; y: number }>;
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

function connectedComponents(
  mask: Uint8Array,
  grid: number,
): {
  labels: Int32Array;
  counts: number[];
  fillRatios: number[];
  bounds: Array<{ minX: number; minY: number; maxX: number; maxY: number }>;
} {
  const labels = new Int32Array(mask.length).fill(-1);
  const counts: number[] = [];
  const bounds: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];
  const fillRatios: number[] = [];
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
      const boxW = maxX - minX + 1;
      const boxH = maxY - minY + 1;
      counts.push(count);
      bounds.push({ minX, minY, maxX, maxY });
      fillRatios.push(count / (boxW * boxH));
    }
  }
  return { labels, counts, fillRatios, bounds };
}

/**
 * Greedy centerline walk over the road blob. Starts at the darkest cell (or
 * a blob endpoint) and follows the highest-darkness unvisited neighbour,
 * preferring cells that continue the current heading.
 */
function extractRoadPath(
  darkness: Float32Array,
  mask: Uint8Array,
  labels: Int32Array,
  label: number,
  grid: number,
): Array<[number, number]> {
  const visited = new Uint8Array(grid * grid);
  const neighbours = (cx: number, cy: number) => {
    const out: Array<{ x: number; y: number; value: number }> = [];
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
          out.push({ x: nx, y: ny, value: darkness[index] });
        }
      }
    }
    return out;
  };

  // Start at the darkest cell of the blob.
  let seed = -1;
  let seedValue = -1;
  for (let i = 0; i < darkness.length; i++) {
    if (labels[i] === label && darkness[i] > seedValue) {
      seedValue = darkness[i];
      seed = i;
    }
  }
  if (seed === -1) {
    return [];
  }
  const seedX = seed % grid;
  const seedY = (seed / grid) | 0;

  const path: Array<[number, number]> = [[seedX, seedY]];
  visited[seed] = 1;

  const walk = (initialHeading: number) => {
    let cx = seedX;
    let cy = seedY;
    let heading = initialHeading;
    let prevX = seedX - Math.cos(heading);
    let prevY = seedY - Math.sin(heading);
    for (let step = 0; step < grid * grid; step++) {
      const candidates = neighbours(cx, cy);
      if (candidates.length === 0) {
        break;
      }
      // Prefer the candidate that continues the current heading.
      candidates.sort((a, b) => {
        const angleA = Math.atan2(a.y - cy, a.x - cx);
        const angleB = Math.atan2(b.y - cy, b.x - cx);
        let deltaA = Math.abs(angleA - heading);
        let deltaB = Math.abs(angleB - heading);
        if (deltaA > Math.PI) deltaA = Math.PI * 2 - deltaA;
        if (deltaB > Math.PI) deltaB = Math.PI * 2 - deltaB;
        if (deltaA === deltaB) {
          return b.value - a.value;
        }
        return deltaA - deltaB;
      });
      const next = candidates[0];
      cx = next.x;
      cy = next.y;
      visited[cy * grid + cx] = 1;
      path.push([cx, cy]);
      heading = Math.atan2(cy - prevY, cx - prevX);
      prevX = cx;
      prevY = cy;
    }
  };

  // Walk forward from the seed, then walk the reverse side by restarting
  // from the seed in the opposite initial direction (handles loops and
  // prevents doubling back over the same cells).
  const first = neighbours(seedX, seedY);
  if (first.length > 0) {
    const initialHeading = Math.atan2(first[0].y - seedY, first[0].x - seedX);
    walk(initialHeading);
    const visitedClone = Array.from(path);
    visited.fill(0);
    for (const [px, py] of visitedClone) {
      visited[py * grid + px] = 1;
    }
    // Restart the walk from the seed toward the opposite side.
    let reverseHeading = initialHeading + Math.PI;
    if (reverseHeading > Math.PI) reverseHeading -= Math.PI * 2;
    const reversePath: Array<[number, number]> = [];
    let cx = seedX;
    let cy = seedY;
    let heading = reverseHeading;
    for (let step = 0; step < grid * grid; step++) {
      const candidates = neighbours(cx, cy);
      if (candidates.length === 0) {
        break;
      }
      candidates.sort((a, b) => {
        const angleA = Math.atan2(a.y - cy, a.x - cx);
        const angleB = Math.atan2(b.y - cy, b.x - cx);
        let deltaA = Math.abs(angleA - heading);
        let deltaB = Math.abs(angleB - heading);
        if (deltaA > Math.PI) deltaA = Math.PI * 2 - deltaA;
        if (deltaB > Math.PI) deltaB = Math.PI * 2 - deltaB;
        if (deltaA === deltaB) {
          return b.value - a.value;
        }
        return deltaA - deltaB;
      });
      const next = candidates[0];
      cx = next.x;
      cy = next.y;
      visited[cy * grid + cx] = 1;
      reversePath.push([cx, cy]);
      if (reversePath.length > 1) {
        const prev = reversePath[reversePath.length - 2];
        heading = Math.atan2(cy - prev[1], cx - prev[0]);
      }
    }
    // Reverse the reverse path so it reads seed -> outward, then prepend
    // (dropping the duplicate seed cell at the joint).
    reversePath.reverse();
    const combined = [...reversePath, ...path.slice(1)];
    return combined;
  }
  return path;
}

export async function parseSketch(dataUrl: string): Promise<ParsedSketch> {
  const { data, width } = await decodeImageToGrid(dataUrl, PARSE_GRID);
  const grid = width;
  const darkness = new Float32Array(grid * grid);
  const mask = new Uint8Array(grid * grid);
  for (let i = 0; i < grid * grid; i++) {
    const offset = i * 4;
    const luma =
      (0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]) /
      255;
    darkness[i] = 1 - luma;
    if (darkness[i] > DARK_THRESHOLD) {
      mask[i] = 1;
    }
  }

  const { labels, counts, fillRatios, bounds } = connectedComponents(
    mask,
    grid,
  );

  const features = counts
    .map((count, label) => ({
      label,
      count,
      fillRatio: fillRatios[label],
      bounds: bounds[label],
    }))
    .filter((feature) => feature.count >= MIN_FEATURE_AREA);

  // The road is the dominant blob; everything else is classified by shape.
  let roadLabel = -1;
  let roadArea = 0;
  for (const feature of features) {
    if (feature.count > roadArea) {
      roadArea = feature.count;
      roadLabel = feature.label;
    }
  }

  const roadPath: Array<[number, number]> = [];
  let roadWidthCells = 0;
  const ramps: Array<{ x: number; y: number }> = [];
  const buildings: Array<{ x: number; y: number }> = [];
  const trees: Array<{ x: number; y: number }> = [];

  if (roadLabel !== -1) {
    const path = extractRoadPath(darkness, mask, labels, roadLabel, grid);
    if (path.length >= 2) {
      roadPath.push(...path);
      roadWidthCells = Math.max(2, roadArea / path.length);
    }
  }

  for (const feature of features) {
    if (feature.label === roadLabel || feature.count < MIN_FEATURE_AREA) {
      continue;
    }
    const { bounds: box } = feature;
    const centerX = (box.minX + box.maxX) / 2;
    const centerY = (box.minY + box.maxY) / 2;
    if (feature.fillRatio >= SOLID_FILL_RATIO) {
      if (feature.count < BUILDING_MIN_AREA) {
        ramps.push({ x: centerX, y: centerY });
      } else {
        buildings.push({ x: centerX, y: centerY });
      }
    } else {
      trees.push({ x: centerX, y: centerY });
    }
  }

  return {
    grid,
    darkness,
    roadPath,
    roadWidthCells,
    ramps,
    buildings,
    trees,
  };
}