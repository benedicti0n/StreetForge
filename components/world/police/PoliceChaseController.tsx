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
  const stuckTimerRef = useRef(0);
  const recoveryTimerRef = useRef(0);
  const recoverySteerSignRef = useRef<1 | -1>(1);
  const config = chaseConfig ?? POLICE_CHASE;

  useBeforePhysicsStep((stepWorld) => {
    const police = policeBodyRef?.current;
    if (!active || !police) {
      Object.assign(policeControlsRef.current, IDLE_CONTROLS);
      stateRef.current = "idle";
      smoothedSteeringRef.current = 0;
      stuckTimerRef.current = 0;
      recoveryTimerRef.current = 0;
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
    _policeForward.set(0, 0, 1).applyQuaternion(_policeQuaternion);
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
    const previousSteering = smoothedSteeringRef.current;
    const steering =
      clamp(desiredSteering - previousSteering, -steeringRate, steeringRate) +
      previousSteering;

    const policeSpeed = Math.hypot(
      police.linvel().x,
      police.linvel().y,
      police.linvel().z,
    );
    const playerSpeed = Math.hypot(
      player.linvel().x,
      player.linvel().y,
      player.linvel().z,
    );
    const absError = Math.abs(headingError);

    let state = stateRef.current;

    if (state === "pursuit") {
      let desiredSpeed: number;
      if (distance > config.farDistance) {
        desiredSpeed = config.farCruiseSpeed;
      } else if (distance > config.closeDistance) {
        const t =
          (distance - config.closeDistance) /
          (config.farDistance - config.closeDistance);
        desiredSpeed =
          config.midCruiseSpeed +
          (config.farCruiseSpeed - config.midCruiseSpeed) * t;
      } else if (distance > config.veryCloseDistance) {
        desiredSpeed = config.closeCruiseSpeed;
      } else {
        desiredSpeed = config.veryCloseSpeed;
      }
      if (playerSpeed < 1.5 && distance < config.closeDistance) {
        desiredSpeed = Math.min(desiredSpeed, config.stationaryApproachSpeed);
      }

      const errorSlowdown = 1 - clamp((absError - 0.4) / 1.4, 0, 0.65);
      desiredSpeed *= errorSlowdown;

      const throttleRequest = clamp((desiredSpeed - policeSpeed) / 8, 0.2, 1);

      let throttle = 0;
      let brake = 0;

      if (absError > config.brakeError) {
        if (policeSpeed < 4) {
          throttle = config.recoveryReverseThrottle * 0.7;
          brake = 0;
        } else {
          brake = 0.8;
        }
      } else if (policeSpeed < desiredSpeed - 0.5) {
        throttle = throttleRequest;
      } else if (policeSpeed > desiredSpeed + 1) {
        brake = clamp((policeSpeed - desiredSpeed) / 6, 0.15, 0.7);
      } else {
        throttle = 0.12;
      }

      // Stuck detection: requesting throttle but barely moving.
      if (
        distance > config.stuckMinDistance &&
        throttleRequest > 0.5 &&
        policeSpeed < config.stuckSpeedThreshold
      ) {
        stuckTimerRef.current += dt;
      } else {
        stuckTimerRef.current = Math.max(0, stuckTimerRef.current - dt);
      }

      if (stuckTimerRef.current >= config.stuckTimeSeconds) {
        state = "recovery";
        stateRef.current = "recovery";
        recoveryTimerRef.current = config.recoveryDurationSeconds;
        stuckTimerRef.current = 0;
        recoverySteerSignRef.current = Math.random() < 0.5 ? -1 : 1;
      }

      smoothedSteeringRef.current = steering;

      Object.assign(policeControlsRef.current, {
        ...NEUTRAL_CONTROLS,
        throttle,
        brake,
        steering,
      });
    } else {
      // RECOVERY: reverse briefly while steering away from the previous heading.
      recoveryTimerRef.current -= dt;
      if (recoveryTimerRef.current <= 0) {
        state = "pursuit";
        stateRef.current = "pursuit";
        smoothedSteeringRef.current = 0;
      }
      Object.assign(policeControlsRef.current, {
        ...NEUTRAL_CONTROLS,
        throttle: config.recoveryReverseThrottle,
        steering: recoverySteerSignRef.current,
      });
    }

    if (telemetryRef) {
      telemetryRef.current = {
        state,
        distanceToPlayer: distance,
        headingError,
        playerSpeedKmh: playerSpeed * 3.6,
        policeSpeedKmh: policeSpeed * 3.6,
        predictedTargetX: _predictedTarget.x,
        predictedTargetZ: _predictedTarget.z,
      };
    }
  });

  return null;
}