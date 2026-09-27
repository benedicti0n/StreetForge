/**
 * Local obstacle avoidance for the police vehicle.
 *
 * Three forward ray probes (centre, left, right) are cast from the police
 * bumper. Hits whose surface normal points mostly up are treated as
 * drivable terrain or slopes and ignored; anything else is an obstacle.
 * Obstacles nudge the pursuit steering toward the clearer probe and reduce
 * speed when directly ahead.
 */
export const POLICE_AVOIDANCE = {
  /** Probe angles relative to the police forward axis (radians). */
  probes: [
    { angle: 0 },
    { angle: -0.45 },
    { angle: 0.45 },
  ] as const,
  /** How far the probes reach (metres). */
  probeDistance: 10,
  /** Surfaces with normal.y above this are treated as drivable terrain. */
  obstacleNormalY: 0.6,
  /** Obstacles within this distance start steering the police away. */
  avoidDistance: 12,
  /** Obstacles within this distance reduce throttle. */
  brakeDistance: 6,
  /** Obstacles within this distance brake hard. */
  hardBrakeDistance: 3,
} as const;