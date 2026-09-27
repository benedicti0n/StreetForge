/**
 * Canonical semantic palette for the AI-normalized forge maps.
 */

export const SEMANTIC_PALETTE = {
  terrain: "#8FB878",
  road: "#303238",
  shoulder: "#B8A272",
  water: "#3388DD",
  building: "#D64545",
  vegetation: "#397B3B",
  ramp: "#E99A28",
} as const;

export type SemanticClass = keyof typeof SEMANTIC_PALETTE;

export const SEMANTIC_CLASSES: SemanticClass[] = [
  "terrain",
  "road",
  "shoulder",
  "water",
  "building",
  "vegetation",
  "ramp",
];

export function hexRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Precomputed palette RGB entries. */
export const SEMANTIC_RGB: Record<SemanticClass, [number, number, number]> = {
  terrain: hexRgb(SEMANTIC_PALETTE.terrain),
  road: hexRgb(SEMANTIC_PALETTE.road),
  shoulder: hexRgb(SEMANTIC_PALETTE.shoulder),
  water: hexRgb(SEMANTIC_PALETTE.water),
  building: hexRgb(SEMANTIC_PALETTE.building),
  vegetation: hexRgb(SEMANTIC_PALETTE.vegetation),
  ramp: hexRgb(SEMANTIC_PALETTE.ramp),
};