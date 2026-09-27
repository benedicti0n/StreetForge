export type ExperienceState =
  | "editing"
  | "generating"
  | "world-ready"
  | "countdown"
  | "playing"
  | "escaped"
  | "busted";

export interface GameResultStats {
  outcome: "escaped" | "busted";
  peakSpeedKmh: number;
  durationSeconds: number;
  closestPoliceMeters: number;
}

export interface GameWorldInfo {
  halfExtent: number;
  playerSpawn: [number, number, number];
  policeSpawn: [number, number, number];
}

export interface GameRefs {
  playerVehicleRef: { current: { reset(): void } | null };
  policeVehicleRef: { current: { reset(): void } | null };
  playerBodyRef: { current: { translation(): { x: number; y: number; z: number }; linvel(): { x: number; y: number; z: number } } | null };
  policeBodyRef: { current: { translation(): { x: number; y: number; z: number }; linvel(): { x: number; y: number; z: number } } | null };
  playerTelemetryRef: { current: { speedKmh: number; groundedWheels: number; collisionImpact?: number } | null };
  policeTelemetryRef: { current: { speedKmh: number; groundedWheels: number; collisionImpact?: number } | null };
  chaseTelemetryRef: { current: { distanceToPlayer: number; state: string } | null };
  worldInfoRef: { current: GameWorldInfo | null };
}

/** Escape distance is derived from the playable world footprint. */
export const ESCAPE_DISTANCE_FACTOR = 0.5;
export const ESCAPE_DISTANCE_MIN = 35;
export const ESCAPE_DISTANCE_MAX = 65;
/** Time the player must stay beyond the escape distance to win. */
export const ESCAPE_HOLD_SECONDS = 6;
/** Time for full escape progress to decay once the condition is lost. */
export const ESCAPE_DECAY_SECONDS = 3;
/** Player must be grounded, and moving or displaced, to earn escape progress. */
export const ESCAPE_MIN_SPEED_KMH = 8;
export const ESCAPE_MIN_DISPLACEMENT_M = 5;

/** Distance below which the police can begin a capture. */
export const BUST_CLOSE_DISTANCE_M = 4.2;
/** Player speed below which the capture can progress. */
export const BUST_SLOW_SPEED_KMH = 11;
/** Time the capture condition must hold to get busted. */
export const BUST_HOLD_SECONDS = 3;
/** Time for bust progress to decay once the player breaks free. */
export const BUST_DECAY_SECONDS = 2.5;
/** Multiplier while the police are physically touching the player. */
export const BUST_COLLISION_MULTIPLIER = 1.5;
/** A recent police collision still counts as contact for this long. */
export const BUST_CONTACT_WINDOW_MS = 1200;