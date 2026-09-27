/**
 * Builds the Forge world's single visual terrain texture directly from the
 * parsed 2D road mask. The texture guarantees the road, shoulder and
 * terrain are always visually consistent with the parsed layout.
 */

import {
  Color,
  SRGBColorSpace,
  Texture,
  CanvasTexture,
} from "three";

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

  const terrain = new Color(TERRAIN_COLOR);
  const shoulder = new Color(SHOULDER_COLOR);
  const asphalt = new Color(ASPHALT_COLOR);

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
        data[offset] = Math.round(asphalt.r * 255);
        data[offset + 1] = Math.round(asphalt.g * 255);
        data[offset + 2] = Math.round(asphalt.b * 255);
        roadPixels++;
      } else if (shoulderMask[cell] === 1) {
        data[offset] = Math.round(shoulder.r * 255);
        data[offset + 1] = Math.round(shoulder.g * 255);
        data[offset + 2] = Math.round(shoulder.b * 255);
        shoulderPixels++;
      } else {
        data[offset] = Math.round(terrain.r * 255);
        data[offset + 1] = Math.round(terrain.g * 255);
        data[offset + 2] = Math.round(terrain.b * 255);
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

  // Development debug corner markers: NW red, NE green, SE blue, SW yellow.
  if (process.env.NODE_ENV === "development") {
    const marker = (gx: number, gy: number, color: string) => {
      context.fillStyle = color;
      context.fillRect(gx * scale - 4, gy * scale - 4, 8, 8);
    };
    marker(0, 0, "#ff0000");
    marker(grid - 1, 0, "#00ff00");
    marker(grid - 1, grid - 1, "#0000ff");
    marker(0, grid - 1, "#ffff00");
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