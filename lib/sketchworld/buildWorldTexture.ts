/**
 * Builds the Forge world's single visual terrain texture directly from the
 * parsed 2D road mask. The texture guarantees the road, shoulder and
 * terrain are always visually consistent with the parsed layout.
 */

import {
  SRGBColorSpace,
  Texture,
  CanvasTexture,
} from "three";

function hexRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export const WATER_COLOR = "#3E9BEF";

export const TERRAIN_COLOR = "#7FB069";
export const SHOULDER_COLOR = "#C2A878";
export const ASPHALT_COLOR = "#2C2E35";
export const MARKING_COLOR = "#F2E7C8";

export interface WorldTextureSource {
  /** The authoritative road area (1 = asphalt), grid × grid. */
  roadMask: Uint8Array;
  grid: number;
  /** Road centerline in grid coordinates (for painted markings). */
  centerline: Array<[number, number]>;
  corridorValid: boolean;
  /** Optional quantized semantic classes (AI forge): water/shoulder painted
      directly from the semantic map. */
  semanticClasses?: Uint8Array;
}

/**
 * Dilation of the road mask by `radius` cells (square neighbourhood).
 */
function dilateRoadMask(
  roadMask: Uint8Array,
  grid: number,
  radius: number,
): Uint8Array {
  const out = new Uint8Array(grid * grid);
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      if (roadMask[y * grid + x] === 0) {
        continue;
      }
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < grid && ny < grid) {
            out[ny * grid + nx] = 1;
          }
        }
      }
    }
  }
  return out;
}

export interface WorldTextureStats {
  roadPixels: number;
  terrainPixels: number;
  shoulderPixels: number;
  /** Fraction of the map covered by the road area. */
  roadCoverage: number;
}

/**
 * Paints the world texture (terrain, shoulder, asphalt, center markings)
 * into a new canvas at `textureSize` pixels.
 */
export function buildWorldTexture(
  source: WorldTextureSource,
  textureSize = 1024,
): { canvas: HTMLCanvasElement; stats: WorldTextureStats } {
  const { roadMask, grid, centerline, corridorValid } = source;
  const canvas = document.createElement("canvas");
  canvas.width = textureSize;
  canvas.height = textureSize;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D is unavailable.");
  }
  const image = context.createImageData(textureSize, textureSize);
  const data = image.data;

  // Raw sRGB bytes (three's Color converts hex into the linear working
  // space, which would write visibly darker pixels).
  const terrain = hexRgb(TERRAIN_COLOR);
  const shoulder = hexRgb(SHOULDER_COLOR);
  const asphalt = hexRgb(ASPHALT_COLOR);
  const water = hexRgb(WATER_COLOR);

  const shoulderMask = dilateRoadMask(roadMask, grid, 3);
  const scale = textureSize / grid;

  let roadPixels = 0;
  let terrainPixels = 0;
  let shoulderPixels = 0;

  for (let ty = 0; ty < textureSize; ty++) {
    const cy = Math.min(grid - 1, Math.floor(ty / scale));
    for (let tx = 0; tx < textureSize; tx++) {
      const cx = Math.min(grid - 1, Math.floor(tx / scale));
      const cell = cy * grid + cx;
      const offset = (ty * textureSize + tx) * 4;
      if (roadMask[cell] === 1) {
        data[offset] = asphalt[0];
        data[offset + 1] = asphalt[1];
        data[offset + 2] = asphalt[2];
        roadPixels++;
      } else if (source.semanticClasses && source.semanticClasses[cell] === 3) {
        // Water (semantic class index 3) painted straight from the map.
        data[offset] = water[0];
        data[offset + 1] = water[1];
        data[offset + 2] = water[2];
      } else if (shoulderMask[cell] === 1) {
        data[offset] = shoulder[0];
        data[offset + 1] = shoulder[1];
        data[offset + 2] = shoulder[2];
        shoulderPixels++;
      } else {
        data[offset] = terrain[0];
        data[offset + 1] = terrain[1];
        data[offset + 2] = terrain[2];
        terrainPixels++;
      }
      data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  // A single light blur pass softens the cell-block pixelation of the
  // road edges while keeping the overall layout intact.
  blurCanvasOnce(context, textureSize);

  // Center markings painted directly into the texture, only where the
  // sample point lies inside the road mask. Dashes run ALONG the
  // centerline with generous spacing so they read as a clean stylized
  // marking rather than a dense barcode.
  if (corridorValid && centerline.length >= 4) {
    context.strokeStyle = MARKING_COLOR;
    context.lineCap = "round";
    context.lineWidth = Math.max(2, scale * 0.55);
    const dashStep = Math.max(10, scale * 7);
    const dashLengthCells = 1.6;
    for (let i = 0; i < centerline.length; i += dashStep / scale) {
      const startIndex = Math.min(centerline.length - 1, Math.round(i));
      const [gx, gy] = centerline[startIndex];
      if (roadMask[gy * grid + gx] === 0) {
        continue;
      }
      const endIndex = Math.min(
        centerline.length - 1,
        startIndex + Math.round(dashLengthCells),
      );
      const [gx2, gy2] = centerline[endIndex];
      const x1 = gx * scale;
      const y1 = gy * scale;
      const x2 = gx2 * scale;
      const y2 = gy2 * scale;
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    }
  }

  const total = grid * grid;
  return {
    canvas,
    stats: {
      roadPixels,
      terrainPixels,
      shoulderPixels,
      roadCoverage: roadPixels / (total * scale * scale),
    },
  };
}

/** One-pass 3x3 box blur over the whole canvas. */
function blurCanvasOnce(
  context: CanvasRenderingContext2D,
  size: number,
): void {
  const source = context.getImageData(0, 0, size, size);
  const { data } = source;
  const copy = new Uint8ClampedArray(data);
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const o = ((y + dy) * size + (x + dx)) * 4;
          r += copy[o];
          g += copy[o + 1];
          b += copy[o + 2];
        }
      }
      const o = (y * size + x) * 4;
      data[o] = r / 9;
      data[o + 1] = g / 9;
      data[o + 2] = b / 9;
    }
  }
  context.putImageData(source, 0, 0);
}

/**
 * Wraps the world canvas into a CanvasTexture configured for the flat
 * ground plane (canvas row 0 = world -Z, flipY default).
 */
export function worldCanvasToTexture(canvas: HTMLCanvasElement): Texture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  return texture;
}