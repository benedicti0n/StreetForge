export const BLANK_MAP_SIZE = 1024;

export const BLANK_MAP_COLOR = "#f5f4f0";

export interface BlankMapOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
}

export function createBlankMapDataUrl(
  options: BlankMapOptions = {},
): string {
  const {
    width = BLANK_MAP_SIZE,
    height = BLANK_MAP_SIZE,
    backgroundColor = BLANK_MAP_COLOR,
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to acquire a 2D canvas context for the blank map");
  }

  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, width, height);

  return canvas.toDataURL("image/png");
}