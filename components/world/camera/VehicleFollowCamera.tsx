"use client";

import { useFrame, useThree } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { useEffect, useRef, type RefObject } from "react";
import { Quaternion, Vector3 } from "three";
import type { VehicleTelemetry } from "@/components/world/vehicles/vehicleTypes";

const CAMERA_OFFSET = new Vector3(0, 3.4, 6.6);
const LOOK_OFFSET = new Vector3(0, 1.2, -5);
const LOOKAHEAD_OFFSET = new Vector3(0, 0, -1);
const LOOKAHEAD_MIN = 2;
const LOOKAHEAD_MAX = 9;

const _position = new Vector3();
const _quaternion = new Quaternion();
const _yawQuaternion = new Quaternion();
const _desiredPosition = new Vector3();
const _desiredLook = new Vector3();
const _lookedAt = new Vector3();
const _forward = new Vector3();
const _rotated = new Vector3();
const _upAxis = new Vector3(0, 1, 0);

interface VehicleFollowCameraProps {
  bodyRef?: RefObject<RapierRigidBody | null>;
  telemetryRef?: RefObject<VehicleTelemetry | null>;
  active: boolean;
}

export function VehicleFollowCamera({
  bodyRef,
  telemetryRef,
  active,
}: VehicleFollowCameraProps) {
  const camera = useThree((state) => state.camera);
  const smoothedLook = useRef(new Vector3());

  useEffect(() => {
    if (!active) {
      return;
    }
    camera.getWorldDirection(_forward);
    smoothedLook.current.copy(camera.position).addScaledVector(_forward, 10);
  }, [active, camera]);

  useFrame((state, rawDelta) => {
    if (!active) {
      return;
    }
    const body = bodyRef?.current;
    if (!body) {
      return;
    }
    const delta = Math.min(rawDelta, 0.1);
    _position.copy(body.translation() as unknown as Vector3);
    _quaternion.copy(body.rotation() as unknown as Quaternion);

    _forward.set(0, 0, 1).applyQuaternion(_quaternion);
    _forward.y = 0;
    const yaw = Math.atan2(_forward.x, _forward.z);
    _yawQuaternion.setFromAxisAngle(_upAxis, yaw);

    _rotated.copy(CAMERA_OFFSET).applyQuaternion(_yawQuaternion);
    _desiredPosition.copy(_position).add(_rotated);

    const speedKmh = telemetryRef?.current?.speedKmh ?? 0;
    const lookAhead = Math.min(
      LOOKAHEAD_MAX,
      LOOKAHEAD_MIN + (speedKmh / 165) * (LOOKAHEAD_MAX - LOOKAHEAD_MIN),
    );
    _rotated.copy(LOOK_OFFSET).applyQuaternion(_yawQuaternion);
    _forward
      .copy(LOOKAHEAD_OFFSET)
      .multiplyScalar(lookAhead)
      .applyQuaternion(_yawQuaternion);
    _desiredLook.copy(_position).add(_rotated).add(_forward);

    const positionFactor = 1 - Math.exp(-4.2 * delta);
    camera.position.lerp(_desiredPosition, positionFactor);

    const lookFactor = 1 - Math.exp(-6.5 * delta);
    smoothedLook.current.lerp(_desiredLook, lookFactor);
    _lookedAt.copy(smoothedLook.current);
    camera.lookAt(_lookedAt);
  });

  return null;
}