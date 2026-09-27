export const WORLD_SIZE = 1000;
export const WORLD_HALF_EXTENT = WORLD_SIZE / 2;
/** Vehicles outside ±this (x/z) auto-reset to their spawn. */
export const WORLD_RESET_BOUNDS = WORLD_HALF_EXTENT - 10;
/** Vehicles falling below this Y auto-reset to their spawn. */
export const WORLD_FALL_RESET_Y = -10;