"use client";

import { useBeforePhysicsStep } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import { useRef, type RefObject } from "react";
import { Quaternion, Vector3 } from "three";
import {
  IDLE_CONTROLS,
  NEUTRAL_CONTROLS,
  type VehicleControlRef,
} from "@/components/world/vehicles/vehicleTypes";
import { POLICE_CHASE } from "./policeChaseConfig";

export type ChaseState = "idle" | "pursuit" | "recovery";

export interface ChaseTelemetry {
  state: ChaseState;
  distanceToPlayer: number;
  headingError: number;
  playerSpeedKmh: number;
  policeSpeedKmh: number;
}



const _policePosition = new Vector3();
const _playerPosition = new Vector3();
const _toTarget = new Vector3();
const _policeForward = new Vector3();
const _policeQuaternion = new Quaternion();

interface PoliceChaseControllerProps {
  active: boolean;
  playerBodyRef?: RefObject<RapierRigidBody | null>;
  policeBodyRef?: RefObject<RapierRigidBody | null>;
  policeControlsRef: VehicleControlRef;
  telemetryRef?: RefObject<ChaseTelemetry | null>;
  chaseConfig?: typeof POLICE_CHASE;
}

export function PoliceChaseController({
  active,
  playerBodyRef,
  policeBodyRef,
  policeControlsRef,
  telemetryRef,
  chaseConfig,
}: PoliceChaseControllerProps) {
  const stateRef = useRef<ChaseState>("idle");
  const config = chaseConfig ?? POLICE_CHASE;

  useBeforePhysicsStep(() => {
    const police = policeBodyRef?.current;
    if (!active || !police) {
      Object.assign(policeControlsRef.current, IDLE_CONTROLS);
      stateRef.current = "idle";
      if (telemetryRef) {
        telemetryRef.current = {
          state: "idle",
          distanceToPlayer: 0,
          headingError: 0,
          playerSpeedKmh: 0,
          policeSpeedKmh: 0,
        };
      }
      return;
    }

    const player = playerBodyRef?.current;
    if (!player) {
      Object.assign(policeControlsRef.current, IDLE_CONTROLS);
      return;
    }

    stateRef.current = "pursuit";

    _policePosition.copy(police.translation() as unknown as Vector3);
    _playerPosition.copy(player.translation() as unknown as Vector3);
    _toTarget.copy(_playerPosition).sub(_policePosition);
    const distance = _toTarget.length();

    _policeQuaternion.copy(police.rotation() as unknown as Quaternion);
    _policeForward.set(0, 0, -1).applyQuaternion(_policeQuaternion);
    _toTarget.y = 0;
    _policeForward.y = 0;
    const forwardLen = _policeForward.length();
    const headingError =
      forwardLen > 0.001
        ? Math.atan2(
            _toTarget.x * _policeForward.z -
              _toTarget.z * _policeForward.x,
            _toTarget.x * _policeForward.x +
              _toTarget.z * _policeForward.z,
          )
        : 0;

    const steering = Math.max(-1, Math.min(1, headingError * 2.2));

    const policeSpeed = Math.hypot(
      police.linvel().x,
      police.linvel().y,
      police.linvel().z,
    );
    const speedRatio = Math.min(
      Math.max(policeSpeed / config.farCruiseSpeed, 0),
      1,
    );
    const headingFactor =
      Math.abs(headingError) < config.throttleCutError ? 1 : 0;
    const throttle = headingFactor * (1 - speedRatio * 0.4);

    Object.assign(policeControlsRef.current, {
      ...NEUTRAL_CONTROLS,
      throttle: Math.max(0.15, throttle),
      steering,
    });

    if (telemetryRef) {
      telemetryRef.current = {
        state: "pursuit",
        distanceToPlayer: distance,
        headingError,
        playerSpeedKmh:
          Math.hypot(player.linvel().x, player.linvel().y, player.linvel().z) *
          3.6,
        policeSpeedKmh: policeSpeed * 3.6,
      };
    }
  });

  return null;
}