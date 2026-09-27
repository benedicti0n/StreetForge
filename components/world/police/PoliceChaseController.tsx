"use client";

import { useBeforePhysicsStep, useRapier } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import { useRef, type RefObject } from "react";
import { Quaternion, Vector3 } from "three";
import {
  IDLE_CONTROLS,
  NEUTRAL_CONTROLS,
  type VehicleControlRef,
} from "@/components/world/vehicles/vehicleTypes";
import { POLICE_CHASE } from "./policeChaseConfig";
import { POLICE_AVOIDANCE } from "./policeAvoidanceConfig";

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
const _probeDirection = new Vector3();
const _up = new Vector3(0, 1, 0);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

interface PoliceChaseControllerProps {
  active: boolean;
  playerBodyRef?: RefObject<RapierRigidBody | null>;
  policeBodyRef?: RefObject<RapierRigidBody | null>;
  policeControlsRef: VehicleControlRef;
  telemetryRef?: RefObject<ChaseTelemetry | null>;
  chaseConfig?: typeof POLICE_CHASE;
  avoidanceConfig?: typeof POLICE_AVOIDANCE;
}

export function PoliceChaseController({
  active,
  playerBodyRef,
  policeBodyRef,
  policeControlsRef,
  telemetryRef,
  chaseConfig,
  avoidanceConfig,
}: PoliceChaseControllerProps) {
  const stateRef = useRef<ChaseState>("idle");
  const smoothedSteeringRef = useRef(0);
  const stuckTimerRef = useRef(0);
  const recoveryTimerRef = useRef(0);
  const recoverySteerSignRef = useRef<1 | -1>(1);
  const config = chaseConfig ?? POLICE_CHASE;
  const avoidance = avoidanceConfig ?? POLICE_AVOIDANCE;
  const { rapier } = useRapier();

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

    // Lightweight local obstacle avoidance: three forward probes from the
    // police bumper. Steep hits (drivable terrain/slopes) are ignored; wall
    // hits steer toward the clearer probe and reduce speed when close.
    let avoidanceSteering = 0;
    let avoidanceSpeedPenalty = 0;
    if (state === "pursuit") {
      const policeRaw =
        (police as unknown as { raw?: () => object }).raw?.() ?? null;
      const playerRaw =
        (player as unknown as { raw?: () => object }).raw?.() ?? null;
      const filterProbeHit = (collider: { parent(): object | null }) => {
        const body = collider.parent();
        return body !== null && body !== policeRaw && body !== playerRaw;
      };
      _probeDirection.copy(_policeForward).normalize();
      const probeOrigin = {
        x: _policePosition.x + _policeForward.x * 1.5,
        y: _policePosition.y + 1.2,
        z: _policePosition.z + _policeForward.z * 1.5,
      };
      let centerDistance: number | null = null;
      let leftDistance: number | null = null;
      let rightDistance: number | null = null;
      for (const probe of avoidance.probes) {
        _probeDirection.copy(_policeForward).applyAxisAngle(_up, probe.angle);
        _probeDirection.y = -0.06;
        _probeDirection.normalize();
        const ray = new rapier.Ray(
          probeOrigin,
          {
            x: _probeDirection.x,
            y: _probeDirection.y,
            z: _probeDirection.z,
          },
        );
        const hit = stepWorld.castRayAndGetNormal(
          ray,
          avoidance.probeDistance,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          filterProbeHit,
        );
        if (hit === null || hit.normal.y >= avoidance.obstacleNormalY) {
          continue;
        }
        const hitDistance = hit.timeOfImpact;
        if (probe.angle === 0) {
          centerDistance = hitDistance;
        } else if (probe.angle < 0) {
          leftDistance = hitDistance;
        } else {
          rightDistance = hitDistance;
        }
      }

      if (centerDistance !== null) {
        const d = centerDistance;
        const strength = 1 - d / avoidance.avoidDistance;
        if (strength > 0) {
          const leftBlocked = leftDistance !== null;
          const rightBlocked = rightDistance !== null;
          if (leftBlocked && rightBlocked) {
            avoidanceSteering = clamp(
              ((rightDistance ?? 0) - (leftDistance ?? 0)) /
                avoidance.probeDistance,
              -1,
              1,
            );
          } else if (leftBlocked) {
            avoidanceSteering = 1;
          } else if (rightBlocked) {
            avoidanceSteering = -1;
          }
          avoidanceSteering *= clamp(strength, 0, 1);
        }
        if (d < avoidance.brakeDistance) {
          avoidanceSpeedPenalty =
            d < avoidance.hardBrakeDistance
              ? 1
              : (1 - d / avoidance.brakeDistance) * 0.8;
        }
      } else if (leftDistance !== null || rightDistance !== null) {
        // No center obstacle but a flank is blocked: nudge toward the open side.
        if (leftDistance !== null && rightDistance === null) {
          avoidanceSteering = 1;
        } else if (leftDistance === null && rightDistance !== null) {
          avoidanceSteering = -1;
        }
        avoidanceSteering *= 0.35;
      }
    }

    let throttle = 0;
    let brake = 0;
    let finalSteering = steering;

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

      if (avoidanceSpeedPenalty > 0) {
        throttle *= 1 - avoidanceSpeedPenalty;
        if (avoidanceSpeedPenalty > 0.6) {
          brake = Math.max(brake, 0.6);
        } else {
          brake = Math.max(brake, 0.15);
        }
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

      finalSteering = clamp(steering + avoidanceSteering, -1, 1);
      smoothedSteeringRef.current = finalSteering;

      Object.assign(policeControlsRef.current, {
        ...NEUTRAL_CONTROLS,
        throttle,
        brake,
        steering: finalSteering,
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