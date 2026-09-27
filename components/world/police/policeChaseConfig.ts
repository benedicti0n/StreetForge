export const POLICE_CHASE = {
  /** Pursuit prediction lead time bounds (seconds). */
  leadTimeMin: 0.1,
  leadTimeMax: 1.25,
  /** Distance (m) at which the full lead time is applied. */
  leadTimeFullDistance: 40,

  /** Distance thresholds (m). */
  farDistance: 40,
  closeDistance: 12,
  veryCloseDistance: 6,

  /** Desired police speeds (m/s). */
  farCruiseSpeed: 47,
  midCruiseSpeed: 44,
  closeCruiseSpeed: 34,
  veryCloseSpeed: 24,
  /** Target speed when the player is stationary. */
  stationaryApproachSpeed: 30,

  /** Steering smoothing (rad/s max change). */
  maxSteeringRate: 4.5,
  /** Steering damping on heading-error change. */
  steeringDamping: 0.35,

  /** Heading error (rad) above which throttle is cut. */
  throttleCutError: 1.1,
  /** Heading error (rad) above which braking is applied. */
  brakeError: 2.2,

  /** Stuck detection. */
  stuckSpeedThreshold: 1.5,
  stuckTimeSeconds: 2.0,
  stuckMinDistance: 10,

  /** Recovery behavior. */
  recoveryDurationSeconds: 1.6,
  recoveryReverseThrottle: -0.6,
  recoverySteering: 1,
} as const;