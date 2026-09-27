/**
 * Deterministic post-processing of the AI-normalized map: every pixel is
 * assigned to the nearest canonical semantic color. Imperfect model output
 * (antialiasing, shifted RGB) becomes a clean 7-color semantic map.
 */

import {
  SEMANTIC_CLASSES,
  SEMANTIC_RGB,
  type SemanticClass,
} from "./palette";

export interface QuantizedMap {
  /** Semantic class per pixel, grid × grid. */
  classes: Uint8Array;
  grid: number;
  /** The quantized map as a canvas (canonical colors only). */
  canvas: HTMLCanvasElement;
  /** Unique semantic classes present (development verification). */
  uniqueClasses: SemanticClass[];
}

// Generous tolerance: slightly off palette colors from the image model
// still map to their intended semantic class instead of being dropped.
const MAX_PALETTE_DISTANCE = 130;

function decodeToGrid(
  image: HTMLImageElement,
  grid: number,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = grid;
  canvas.height = grid;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas 2D is unavailable.");
  }
  context.drawImage(image, 0, 0, grid, grid);
  return context.getImageData(0, 0, grid, grid).data;
}

export async function quantizeSemanticMap(
  image: HTMLImageElement,
  grid = 256,
): Promise<QuantizedMap> {
  const data = decodeToGrid(image, grid);
  const classes = new Uint8Array(grid * grid);
  const seen = new Set<SemanticClass>();
  const palette = SEMANTIC_CLASSES.map((name) => ({
    name,
    rgb: SEMANTIC_RGB[name],
  }));

  for (let i = 0; i < grid * grid; i++) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];
    if (a < 128) {
      classes[i] = 0; // transparent -> terrain
      continue;
    }
    let best = 0;
    let bestDistance = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const [pr, pg, pb] = palette[p].rgb;
      const distance =
        (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = p;
      }
    }
    if (Math.sqrt(bestDistance) > MAX_PALETTE_DISTANCE) {
      // Unrelated colors (weird reds/purples) become terrain, never a
      // semantic object.
      classes[i] = 0;
    } else {
      classes[i] = best;
      seen.add(palette[best].name);
    }
  }

  // Rebuild the canonical map as a canvas at the full 1024 resolution.
  const canvas = document.createElement("canvas");
  canvas.width = grid;
  canvas.height = grid;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D is unavailable.");
  }
  const imageData = context.createImageData(grid, grid);
  for (let i = 0; i < grid * grid; i++) {
    const [r, g, b] = SEMANTIC_RGB[palette[classes[i]].name];
    imageData.data[i * 4] = r;
    imageData.data[i * 4 + 1] = g;
    imageData.data[i * 4 + 2] = b;
    imageData.data[i * 4 + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);

  return {
    classes,
    grid,
    canvas,
    uniqueClasses: [...seen],
  };
}