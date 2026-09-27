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
/** Minimum blob area (cells) for a prop to be generated. */
export const MIN_PROP_AREA = 6;
/** Blobs at or below this area become a single tree. */
export const TREE_MAX_AREA = 40;
/** Wide/flat blobs at or above this aspect become a ramp. */
export const RAMP_MIN_ASPECT = 1.3;

export interface ParsedSketch {
  grid: number;
  /** Cell darkness 0..1 indexed [y * grid + x]. */
  darkness: Float32Array;
  /** Road centerline in grid coordinates (row, col), from first to last. */
  roadPath: Array<[number, number]>;
  /** Average road width in grid cells. */
  roadWidthCells: number;
  ramps: Array<{ x: number; y: number }>;
  buildings: Array<{
    x: number;
    y: number;
    widthCells: number;
    heightCells: number;
  }>;
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

/**
 * Flood-fills from the grid borders over the non-drawn cells. Any cell that
 * cannot be reached from the outside is an enclosed interior (a closed
 * outlined shape), which becomes drawn. This turns outlined roads/shapes
 * into solid regions instead of thin "linings".
 */
function fillEnclosedInteriors(mask: Uint8Array, grid: number): void {
  const reached = new Uint8Array(grid * grid);
  const stack: number[] = [];
  const inBounds = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < grid && y < grid;
  const push = (x: number, y: number) => {
    if (!inBounds(x, y)) {
      return;
    }
    const index = y * grid + x;
    if (mask[index] === 0 && reached[index] === 0) {
      reached[index] = 1;
      stack.push(index);
    }
  };
  for (let x = 0; x < grid; x++) {
    push(x, 0);
    push(x, grid - 1);
  }
  for (let y = 0; y < grid; y++) {
    push(0, y);
    push(grid - 1, y);
  }
  while (stack.length > 0) {
    const index = stack.pop()!;
    const cx = index % grid;
    const cy = (index / grid) | 0;
    push(cx - 1, cy);
    push(cx + 1, cy);
    push(cx, cy - 1);
    push(cx, cy + 1);
  }
  for (let i = 0; i < grid * grid; i++) {
    if (mask[i] === 0 && reached[i] === 0) {
      mask[i] = 1;
    }
  }
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
/**
 * Chamfer (3-4) distance transform over the blob: each cell holds its
 * distance to the nearest non-blob cell. The road walk follows the highest
 * distance values - the blob's medial ridge - so filled strokes, loops and
 * rings all yield their true centreline instead of their outline.
 */
function medialDistance(
  labels: Int32Array,
  label: number,
  grid: number,
): Float32Array {
  const INF = 1e9;
  const dist = new Float32Array(grid * grid).fill(INF);
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === label) {
      dist[i] = 0;
    }
  }
  const relax = (x: number, y: number, dx: number, dy: number, cost: number) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) {
      return;
    }
    const index = ny * grid + nx;
    if (labels[index] === label && dist[index] > dist[y * grid + x] + cost) {
      dist[index] = dist[y * grid + x] + cost;
    }
  };
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      if (labels[y * grid + x] !== label) {
        continue;
      }
      relax(x, y, -1, 0, 3);
      relax(x, y, 0, -1, 3);
      relax(x, y, -1, -1, 4);
      relax(x, y, 1, -1, 4);
    }
  }
  for (let y = grid - 1; y >= 0; y--) {
    for (let x = grid - 1; x >= 0; x--) {
      if (labels[y * grid + x] !== label) {
        continue;
      }
      relax(x, y, 1, 0, 3);
      relax(x, y, 0, 1, 3);
      relax(x, y, -1, 1, 4);
      relax(x, y, 1, 1, 4);
    }
  }
  return dist;
}

function extractRoadPath(
  labels: Int32Array,
  label: number,
  grid: number,
): Array<[number, number]> {
  const visited = new Uint8Array(grid * grid);
  const distance = medialDistance(labels, label, grid);
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
          out.push({ x: nx, y: ny, value: distance[index] });
        }
      }
    }
    return out;
  };

  // Start at the cell deepest inside the blob (the medial seed).
  let seed = -1;
  let seedValue = -1;
  for (let i = 0; i < distance.length; i++) {
    if (labels[i] === label && distance[i] > seedValue) {
      seedValue = distance[i];
      seed = i;
    }
  }
  if (seed === -1) {
    return [];
  }
  const seedX = seed % grid;
  const seedY = (seed / grid) | 0;

  const walk = (initialHeading: number, out: Array<[number, number]>) => {
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
      // Prefer the deepest medial cell; the heading is the tie-break.
      candidates.sort((a, b) => {
        if (b.value !== a.value) {
          return b.value - a.value;
        }
        const angleA = Math.atan2(a.y - cy, a.x - cx);
        const angleB = Math.atan2(b.y - cy, b.x - cx);
        let deltaA = Math.abs(angleA - heading);
        let deltaB = Math.abs(angleB - heading);
        if (deltaA > Math.PI) deltaA = Math.PI * 2 - deltaA;
        if (deltaB > Math.PI) deltaB = Math.PI * 2 - deltaB;
        return deltaA - deltaB;
      });
      const next = candidates[0];
      cx = next.x;
      cy = next.y;
      visited[cy * grid + cx] = 1;
      out.push([cx, cy]);
      heading = Math.atan2(cy - prevY, cx - prevX);
      prevX = cx;
      prevY = cy;
    }
  };

  const first = neighbours(seedX, seedY);
  if (first.length === 0) {
    return [[seedX, seedY]];
  }
  const initialHeading = Math.atan2(first[0].y - seedY, first[0].x - seedX);
  const forward: Array<[number, number]> = [[seedX, seedY]];
  walk(initialHeading, forward);

  // Reverse pass from the seed toward the other side (covers loops and the
  // far end of open curves).
  const visitedClone = new Uint8Array(visited);
  visited.fill(0);
  for (let i = 0; i < visitedClone.length; i++) {
    visited[i] = visitedClone[i];
  }
  let reverseHeading = initialHeading + Math.PI;
  if (reverseHeading > Math.PI) reverseHeading -= Math.PI * 2;
  const reverse: Array<[number, number]> = [[seedX, seedY]];
  walk(reverseHeading, reverse);
  reverse.reverse();
  return [...reverse, ...forward.slice(1)];
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

  // Closed outlines become solid regions so a shape drawn as a thin ring
  // generates a full-width road instead of just its lining.
  fillEnclosedInteriors(mask, grid);

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
    .filter((feature) => feature.count >= MIN_PROP_AREA);

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
  const buildings: Array<{
    x: number;
    y: number;
    widthCells: number;
    heightCells: number;
  }> = [];
  const trees: Array<{ x: number; y: number }> = [];

  if (roadLabel !== -1) {
    const path = extractRoadPath(labels, roadLabel, grid);
    if (path.length >= 2) {
      roadPath.push(...path);
      roadWidthCells = Math.max(2, roadArea / path.length);
    }
  }

  // Every non-road blob becomes exactly one prop. No fill-ratio or
  // shape heuristics: small blobs are trees, wide blobs are ramps, the
  // rest are buildings. One logical mark -> one logical prop.
  for (const feature of features) {
    if (feature.label === roadLabel || feature.count < MIN_PROP_AREA) {
      continue;
    }
    const { bounds: box } = feature;
    const boxW = box.maxX - box.minX + 1;
    const boxH = box.maxY - box.minY + 1;
    const aspect = Math.max(boxW, boxH) / Math.max(1, Math.min(boxW, boxH));
    const centerX = (box.minX + box.maxX) / 2;
    const centerY = (box.minY + box.maxY) / 2;
    if (feature.count <= TREE_MAX_AREA) {
      trees.push({ x: centerX, y: centerY });
    } else if (aspect >= RAMP_MIN_ASPECT) {
      ramps.push({ x: centerX, y: centerY });
    } else {
      buildings.push({ x: centerX, y: centerY, widthCells: boxW, heightCells: boxH });
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.info(
      "[streetforge] forge parse",
      JSON.stringify({
        road: roadPath.length >= 2 ? 1 : 0,
        roadPoints: roadPath.length,
        roadWidthCells: Math.round(roadWidthCells),
        trees: trees.length,
        ramps: ramps.length,
        buildings: buildings.length,
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
    trees,
  };
}