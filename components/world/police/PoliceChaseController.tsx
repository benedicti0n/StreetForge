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
  predictedTargetX: number;
  predictedTargetZ: number;
}

const _policePosition = new Vector3();
const _playerPosition = new Vector3();
const _playerVelocity = new Vector3();
const _predictedTarget = new Vector3();
const _toTarget = new Vector3();
const _policeForward = new Vector3();
const _policeQuaternion = new Quaternion();

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

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
  const smoothedSteeringRef = useRef(0);
  const lastHeadingErrorRef = useRef(0);
  const config = chaseConfig ?? POLICE_CHASE;

  useBeforePhysicsStep((stepWorld) => {
    const police = policeBodyRef?.current;
    if (!active || !police) {
      Object.assign(policeControlsRef.current, IDLE_CONTROLS);
      stateRef.current = "idle";
      smoothedSteeringRef.current = 0;
      if (telemetryRef) {
        telemetryRef.current = {
          state: "idle",
          distanceToPlayer: 0,
          headingError: 0,
          playerSpeedKmh: 0,
          policeSpeedKmh: 0,
          predictedTargetX: 0,
          predictedTargetZ: 0,
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
    const dt = stepWorld.timestep;

    _policePosition.copy(police.translation() as unknown as Vector3);
    _playerPosition.copy(player.translation() as unknown as Vector3);
    _playerVelocity.copy(player.linvel() as unknown as Vector3);

    const distance = _playerPosition.distanceTo(_policePosition);

    const leadTime =
      config.leadTimeMin +
      (config.leadTimeMax - config.leadTimeMin) *
        clamp(distance / config.leadTimeFullDistance, 0, 1);

    _predictedTarget
      .copy(_playerPosition)
      .addScaledVector(_playerVelocity, leadTime);
    _predictedTarget.y = 0;

    _toTarget.copy(_predictedTarget).sub(_policePosition);
    _toTarget.y = 0;

    _policeQuaternion.copy(police.rotation() as unknown as Quaternion);
    _policeForward.set(0, 0, -1).applyQuaternion(_policeQuaternion);
    _policeForward.y = 0;
    const forwardLen = _policeForward.length();
    const headingError =
      forwardLen > 0.001
        ? Math.atan2(
            _toTarget.x * _policeForward.z - _toTarget.z * _policeForward.x,
            _toTarget.x * _policeForward.x + _toTarget.z * _policeForward.z,
          )
        : 0;

    const desiredSteering = clamp(headingError * 2.2, -1, 1);
    const steeringRate = config.maxSteeringRate * dt;
    const previous = smoothedSteeringRef.current;
    smoothedSteeringRef.current = clamp(
      desiredSteering - previous,
      -steeringRate,
      steeringRate,
    ) + previous;
    const steering = smoothedSteeringRef.current;
    lastHeadingErrorRef.current = headingError;

    const policeSpeed = Math.hypot(
      police.linvel().x,
      police.linvel().y,
      police.linvel().z,
    );
    const speedRatio = clamp(policeSpeed / config.farCruiseSpeed, 0, 1);
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
        predictedTargetX: _predictedTarget.x,
        predictedTargetZ: _predictedTarget.z,
      };
    }
  });

  return null;
}