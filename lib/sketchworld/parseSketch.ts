/**
 * Deterministic road-corridor sketch parser.
 *
 * The supported road style is a ROAD CORRIDOR drawn as the space between
 * two black loops (an outer boundary and an inner boundary). The black
 * lines are the road edges, not the road itself. Falls back to the simple
 * stroke parser when no valid corridor is found.
 */

export const PARSE_GRID = 256;
/** Cell darkness above which a pixel counts as drawn (0..1). */
export const DARK_THRESHOLD = 0.45;
/** Minimum major boundary component area (cells). */
export const MIN_BOUNDARY_AREA = 400;
/** Minimum corridor area (cells) for a valid road. */
export const MIN_CORRIDOR_AREA = 600;

export interface ParsedSketch {
  grid: number;
  /** Road-corridor mask (1 = drivable road), when a corridor was found. */
  corridor: Uint8Array | null;
  /** The authoritative road-area mask (corridor or fallback blob). */
  roadMask: Uint8Array;
  corridorValid: boolean;
  /** Corridor outer contour in grid coordinates (the road's outer edge). */
  outerContour: Array<[number, number]>;
  /** Corridor inner contour in grid coordinates (the road's inner edge). */
  innerContour: Array<[number, number]>;
  /** Road centerline in grid coordinates (for markings and spawns). */
  centerline: Array<[number, number]>;
  /** Fallback stroke path (when no corridor was found). */
  strokePath: Array<[number, number]>;
  /** Fallback stroke width in cells. */
  strokeWidthCells: number;
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
 * Morphological close (dilate then erode by one cell, 4-neighbourhood) to
 * bridge tiny antialiasing/hand-drawn gaps in the boundary loops.
 */
function morphologicalClose(mask: Uint8Array, grid: number): Uint8Array {
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
 * Labels every non-drawn region (the outside region plus each enclosed
 * region) with a flood fill from the grid borders.
 */
function labelRegions(
  mask: Uint8Array,
  grid: number,
): { region: Int32Array; outsideRegion: number } {
  const region = new Int32Array(grid * grid).fill(-1);
  let nextRegion = 0;
  const stack: number[] = [];
  const inBounds = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < grid && y < grid;
  const flood = (seed: number, id: number) => {
    stack.push(seed);
    region[seed] = id;
    while (stack.length > 0) {
      const index = stack.pop()!;
      const cx = index % grid;
      const cy = (index / grid) | 0;
      const neighbours = [
        [cx - 1, cy],
        [cx + 1, cy],
        [cx, cy - 1],
        [cx, cy + 1],
      ];
      for (const [nx, ny] of neighbours) {
        if (!inBounds(nx, ny)) {
          continue;
        }
        const nIndex = ny * grid + nx;
        if (mask[nIndex] === 0 && region[nIndex] === -1) {
          region[nIndex] = id;
          stack.push(nIndex);
        }
      }
    }
  };
  let outside = -1;
  for (let x = 0; x < grid; x++) {
    if (mask[x] === 0 && region[x] === -1) {
      outside = nextRegion++;
      flood(x, outside);
    }
    const bottom = (grid - 1) * grid + x;
    if (mask[bottom] === 0 && region[bottom] === -1) {
      outside = nextRegion++;
      flood(bottom, outside);
    }
  }
  for (let y = 0; y < grid; y++) {
    const left = y * grid;
    const right = y * grid + grid - 1;
    if (mask[left] === 0 && region[left] === -1) {
      outside = nextRegion++;
      flood(left, outside);
    }
    if (mask[right] === 0 && region[right] === -1) {
      outside = nextRegion++;
      flood(right, outside);
    }
  }
  // Any remaining non-drawn cells are enclosed regions.
  for (let i = 0; i < grid * grid; i++) {
    if (mask[i] === 0 && region[i] === -1) {
      const id = nextRegion++;
      flood(i, id);
    }
  }
  return { region, outsideRegion: outside };
}

/** Moore boundary trace of one dark component (a closed contour loop). */
export function traceBoundary(
  labels: Int32Array,
  label: number,
  grid: number,
): Array<[number, number]> {
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
  const isBlob = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < grid && y < grid && labels[y * grid + x] === label;
  const isBoundary = (x: number, y: number) =>
    isBlob(x, y) &&
    (!isBlob(x - 1, y) ||
      !isBlob(x + 1, y) ||
      !isBlob(x, y - 1) ||
      !isBlob(x, y + 1));
  const path: Array<[number, number]> = [[seedX, seedY]];
  const visited = new Uint8Array(grid * grid);
  visited[seed] = 1;
  let cx = seedX;
  let cy = seedY;
  let direction = 0;
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  for (let step = 0; step < grid * grid; step++) {
    let found = false;
    for (let d = 0; d < 8; d++) {
      const idx = (direction + d) % 8;
      const nx = cx + dirs[idx][0];
      const ny = cy + dirs[idx][1];
      if (isBoundary(nx, ny) && visited[ny * grid + nx] === 0) {
        cx = nx;
        cy = ny;
        visited[cy * grid + cx] = 1;
        path.push([cx, cy]);
        direction = (idx + 5) % 8;
        found = true;
        break;
      }
    }
    if (!found) {
      break;
    }
    if (cx === seedX && cy === seedY) {
      break;
    }
  }
  return path;
}

/** Chamfer (3-4) distance transform over a mask. */
function medialDistance(
  mask: Uint8Array,
  grid: number,
): Float32Array {
  const INF = 1e9;
  const dist = new Float32Array(grid * grid).fill(INF);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1) {
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
    if (mask[index] === 1 && dist[index] > dist[y * grid + x] + cost) {
      dist[index] = dist[y * grid + x] + cost;
    }
  };
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      if (mask[y * grid + x] !== 1) {
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
      if (mask[y * grid + x] !== 1) {
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

/**
 * Greedy medial walk over a mask (the corridor): follows the deepest
 * distance cells with a heading tie-break, forward then reverse from the
 * seed, producing one continuous loop/path.
 */
export function walkMedial(mask: Uint8Array, grid: number): Array<[number, number]> {
  const visited = new Uint8Array(grid * grid);
  const distance = medialDistance(mask, grid);
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
        if (mask[index] === 1 && visited[index] === 0) {
          out.push({ x: nx, y: ny, value: distance[index] });
        }
      }
    }
    return out;
  };

  let seed = -1;
  let seedValue = -1;
  for (let i = 0; i < distance.length; i++) {
    if (mask[i] === 1 && distance[i] > seedValue) {
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

/** Simple stroke-path fallback (darkness walk over the dominant blob). */
function strokePathFallback(
  mask: Uint8Array,
  labels: Int32Array,
  counts: number[],
  grid: number,
): { path: Array<[number, number]>; widthCells: number; roadMask: Uint8Array } {
  let roadLabel = -1;
  let roadArea = 0;
  for (let label = 0; label < counts.length; label++) {
    if (counts[label] > roadArea) {
      roadArea = counts[label];
      roadLabel = label;
    }
  }
  if (roadLabel === -1) {
    return { path: [], widthCells: 0, roadMask: new Uint8Array(grid * grid) };
  }
  const blobMask = new Uint8Array(grid * grid);
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === roadLabel) {
      blobMask[i] = 1;
    }
  }
  const path = walkMedial(blobMask, grid);
  if (path.length < 2) {
    return { path: [], widthCells: 0, roadMask: new Uint8Array(grid * grid) };
  }
  return {
    path,
    widthCells: Math.max(2, roadArea / path.length),
    roadMask: blobMask,
  };
}

export async function parseSketch(dataUrl: string): Promise<ParsedSketch> {
  const { data, width } = await decodeImageToGrid(dataUrl, PARSE_GRID);
  const grid = width;
  const dark = new Uint8Array(grid * grid);
  for (let i = 0; i < grid * grid; i++) {
    const offset = i * 4;
    const luma =
      (0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]) /
      255;
    if (1 - luma > DARK_THRESHOLD) {
      dark[i] = 1;
    }
  }
  const closed = morphologicalClose(dark, grid);
  const { labels, counts, bounds } = connectedComponents(closed, grid);

  // Find the two largest boundary components with one contained inside the
  // other.
  const major: number[] = [];
  for (let label = 0; label < counts.length; label++) {
    if (counts[label] >= MIN_BOUNDARY_AREA) {
      major.push(label);
    }
  }
  major.sort((a, b) => counts[b] - counts[a]);

  let outerLabel = -1;
  let innerLabel = -1;
  if (major.length >= 2) {
    outerLabel = major[0];
    innerLabel = major[1];
    const outer = bounds[outerLabel];
    const inner = bounds[innerLabel];
    const innerInside =
      inner.minX >= outer.minX &&
      inner.maxX <= outer.maxX &&
      inner.minY >= outer.minY &&
      inner.maxY <= outer.maxY;
    if (!innerInside) {
      outerLabel = -1;
      innerLabel = -1;
    }
  }

  let corridor: Uint8Array | null = null;
  let outerContour: Array<[number, number]> = [];
  let innerContour: Array<[number, number]> = [];
  let centerline: Array<[number, number]> = [];
  const fallback = strokePathFallback(closed, labels, counts, grid);
  let roadMask = fallback.roadMask;
  let corridorValid = false;

  if (outerLabel !== -1 && innerLabel !== -1) {
    const { region, outsideRegion } = labelRegions(closed, grid);

    // The road corridor is the enclosed region adjacent to BOTH boundaries.
    let corridorRegion = -1;
    const regionAdjacent = new Map<number, { outer: boolean; inner: boolean }>();
    for (let i = 0; i < grid * grid; i++) {
      if (closed[i] === 1) {
        continue;
      }
      const id = region[i];
      if (id === -1) {
        continue;
      }
      const cx = i % grid;
      const cy = (i / grid) | 0;
      let touchesOuter = false;
      let touchesInner = false;
      for (let dy = -1; dy <= 1 && !(touchesOuter && touchesInner); dy++) {
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
          if (labels[nIndex] === outerLabel) {
            touchesOuter = true;
          }
          if (labels[nIndex] === innerLabel) {
            touchesInner = true;
          }
        }
      }
      const entry = regionAdjacent.get(id) ?? { outer: false, inner: false };
      entry.outer = entry.outer || touchesOuter;
      entry.inner = entry.inner || touchesInner;
      regionAdjacent.set(id, entry);
    }
    for (const [id, entry] of regionAdjacent) {
      if (id !== outsideRegion && entry.outer && entry.inner) {
        corridorRegion = id;
        break;
      }
    }

    if (corridorRegion !== -1) {
      corridor = new Uint8Array(grid * grid);
      let corridorCells = 0;
      for (let i = 0; i < grid * grid; i++) {
        if (region[i] === corridorRegion) {
          corridor[i] = 1;
          corridorCells++;
        }
      }
      if (corridorCells >= MIN_CORRIDOR_AREA) {
        outerContour = traceBoundary(labels, outerLabel, grid);
        innerContour = traceBoundary(labels, innerLabel, grid);
        centerline = walkMedial(corridor, grid);
      } else {
        corridor = null;
      }
    }
  }

  corridorValid = corridor !== null && centerline.length >= 2;
  if (corridorValid && corridor) {
    roadMask = corridor;
  }

  if (process.env.NODE_ENV === "development") {
    if (corridorValid) {
      let corridorPixels = 0;
      for (let i = 0; i < grid * grid; i++) {
        if (corridor?.[i] === 1) {
          corridorPixels++;
        }
      }
      console.info(
        "[streetforge] forge road parse",
        JSON.stringify({
          boundaryComponents: 2,
          corridorPixels,
          centerlinePoints: centerline.length,
        }),
      );
    } else {
      console.info(
        "[streetforge] forge road parse",
        "corridor not found → fallback",
      );
    }
  }

  return {
    grid,
    corridor,
    roadMask,
    corridorValid,
    outerContour,
    innerContour,
    centerline: corridorValid ? centerline : fallback.path,
    strokePath: fallback.path,
    strokeWidthCells: fallback.widthCells,
  };
}