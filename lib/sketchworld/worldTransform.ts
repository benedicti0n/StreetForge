/**
 * Single authoritative 2D semantic-map -> Forge world transform.
 *
 * The Forge world is a square arena of `FORGE_WORLD_SIZE` metres centred on
 * the origin. The AI-normalized semantic map is a `mapWidth x mapHeight`
 * grid in which row 0 is the TOP of the image. Because the ground is a
 * `planeGeometry` rotated `-PI/2` about X with a `flipY` CanvasTexture, the
 * top texture row lands at world -Z, so a higher pixel row must map to a
 * LOWER (more negative) world Z. There is therefore no extra Y inversion:
 * the formula below already places the map's top-left corner at
 * `(-size/2, -size/2)` - the same physical corner as the texture.
 *
 * The `+0.5` offset snaps the semantic cell centre to the centre of the
 * matching texture texel block, so a semantic point sits exactly where that
 * cell is painted on the ground.
 */

export const FORGE_WORLD_SIZE = 160;

/**
 * Maps a semantic-map pixel to Forge world XZ.
 *
 * @param pixelX   semantic map column (0 = left)
 * @param pixelY   semantic map row (0 = top)
 * @param mapWidth  semantic map width in pixels (>= 1)
 * @param mapHeight semantic map height in pixels (>= 1)
 * @param worldSize square world footprint in metres
 * @returns `[worldX, worldZ]`
 */
export function semanticPointToWorld(
  pixelX: number,
  pixelY: number,
  mapWidth: number,
  mapHeight: number,
  worldSize = FORGE_WORLD_SIZE,
): [number, number] {
  return [
    ((pixelX + 0.5) / mapWidth - 0.5) * worldSize,
    ((pixelY + 0.5) / mapHeight - 0.5) * worldSize,
  ];
}

/** Maps semantic cell sizes (in cells) to world metres. */
export function semanticCellsToMeters(
  cells: number,
  mapWidth: number,
  worldSize = FORGE_WORLD_SIZE,
): number {
  return (cells / mapWidth) * worldSize;
}