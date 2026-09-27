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

export const WATER_COLOR = "#3388DD";

export const TERRAIN_COLOR = "#93bd6f";
export const SHOULDER_COLOR = "#bca676";
export const ASPHALT_COLOR = "#303139";
export const MARKING_COLOR = "#f2e3a1";

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

  // Center markings painted directly into the texture, only where the
  // sample point lies inside the road mask.
  if (corridorValid && centerline.length >= 4) {
    context.strokeStyle = MARKING_COLOR;
    context.lineCap = "round";
    context.lineWidth = Math.max(2, scale * 0.7);
    const dashLength = Math.max(4, scale * 2.2);
    const gapLength = Math.max(6, scale * 4);
    for (let i = 0; i < centerline.length; i += 1) {
      const [gx, gy] = centerline[i];
      if (roadMask[gy * grid + gx] === 0) {
        continue;
      }
      const x = gx * scale;
      const y = gy * scale;
      const next = centerline[Math.min(centerline.length - 1, i + 1)];
      const dx = next[0] - gx;
      const dy = next[1] - gy;
      const length = Math.hypot(dx, dy);
      if (length < 0.001) {
        continue;
      }
      const ux = dx / length;
      const uy = dy / length;
      const px = -uy;
      const py = ux;
      // A short dash perpendicular to the centerline at this sample.
      context.beginPath();
      context.moveTo(x - px * dashLength * 0.4, y - py * dashLength * 0.4);
      context.lineTo(x + px * dashLength * 0.4, y + py * dashLength * 0.4);
      context.stroke();
      i += gapLength / scale;
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