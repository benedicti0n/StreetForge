export interface VehicleControlState {
  /** -1 (full reverse) → +1 (full forward) */
  throttle: number;
  /** 0 → 1 */
  brake: number;
  /** -1 (left) → +1 (right) */
  steering: number;
  /** 0 → 1 */
  handbrake: number;
}

export const IDLE_CONTROLS: VehicleControlState = {
  throttle: 0,
  brake: 1,
  steering: 0,
  handbrake: 1,
};

export const NEUTRAL_CONTROLS: VehicleControlState = {
  throttle: 0,
  brake: 0,
  steering: 0,
  handbrake: 0,
};

export type VehicleControlRef = { current: VehicleControlState };

export interface VehicleTelemetry {
  speedKmh: number;
  steering: number;
  throttle: number;
  handbrake: number;
  lateralSlip: number;
  /** Impact speed (m/s) of the most recent collision, cleared by consumers. */
  collisionImpact?: number;
}