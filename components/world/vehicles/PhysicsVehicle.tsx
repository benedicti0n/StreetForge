"use client";

import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import {
  DynamicRayCastVehicleController,
  QueryFilterFlags,
  Vector3,
  type Collider,
} from "@dimforge/rapier3d-compat";
import { useFrame } from "@react-three/fiber";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type RefObject,
} from "react";
import {
  VEHICLE_DEFINITIONS,
  type VehicleId,
  type WheelSlot,
} from "./vehicleDefinitions";
import {
  type VehicleControlRef,
  type VehicleTelemetry,
} from "./vehicleTypes";
import { VehicleModel } from "./VehicleModel";

export interface PhysicsVehicleHandle {
  reset(): void;
}

interface PhysicsVehicleProps {
  vehicle: VehicleId;
  controls: VehicleControlRef;
  isPlayer?: boolean;
  autoResetBelowY?: number;
  onLoad?: () => void;
  onTelemetry?: (telemetry: VehicleTelemetry) => void;
  telemetryRef?: RefObject<VehicleTelemetry | null>;
}

const WHEEL_ORDER: WheelSlot[] = ["fl", "fr", "rl", "rr"];
const FRONT_WHEELS: WheelSlot[] = ["fl", "fr"];
const REAR_WHEELS: WheelSlot[] = ["rl", "rr"];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const PhysicsVehicle = forwardRef<
  PhysicsVehicleHandle,
  PhysicsVehicleProps
>(function PhysicsVehicle(
  {
    vehicle,
    controls,
    isPlayer = false,
    autoResetBelowY,
    onLoad,
    onTelemetry,
    telemetryRef,
  },
  ref,
) {
  const definition = VEHICLE_DEFINITIONS[vehicle];
  const physics = definition.physics;
  const { world } = useRapier();
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const controllerRef = useRef<DynamicRayCastVehicleController | null>(null);

  useEffect(() => {
    const body = rigidBodyRef.current;
    if (!body) {
      return;
    }
    const controller = world.createVehicleController(body);
    controller.indexUpAxis = 1;
    controller.setIndexForwardAxis = 2;
    for (const slot of WHEEL_ORDER) {
      const position = physics.wheelPositions[slot];
      controller.addWheel(
        new Vector3(position[0], position[1], position[2]),
        new Vector3(0, -1, 0),
        new Vector3(-1, 0, 0),
        physics.suspensionRestLength,
        physics.wheelRadius,
      );
      const index = controller.numWheels() - 1;
      controller.setWheelSuspensionStiffness(
        index,
        physics.suspensionStiffness,
      );
      controller.setWheelMaxSuspensionTravel(
        index,
        physics.maxSuspensionTravel,
      );
      controller.setWheelMaxSuspensionForce(index, physics.maxSuspensionForce);
      controller.setWheelFrictionSlip(index, physics.frictionSlip);
      controller.setWheelSideFrictionStiffness(
        index,
        physics.sideFrictionStiffness,
      );
    }
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.free();
    };
  }, [world, physics]);

  const handleReset = useCallback(() => {
    const body = rigidBodyRef.current;
    if (!body) {
      return;
    }
    const spawn = definition.worldPosition;
    const rotation = definition.visualRotation;
    body.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true);
    body.setRotation(
      { x: rotation[0], y: rotation[1], z: rotation[2], w: 1 },
      true,
    );
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.wakeUp();
  }, [definition.worldPosition, definition.visualRotation]);

  useImperativeHandle(ref, () => ({ reset: handleReset }), [handleReset]);

  const handleCollision = useCallback(
    (payload: {
      other: {
        rigidBody?: RapierRigidBody | null;
      };
    }) => {
      const body = rigidBodyRef.current;
      const current = telemetryRef?.current;
      if (!body || !current) {
        return;
      }
      const otherLinvel = payload.other.rigidBody?.linvel();
      const linvel = body.linvel();
      const impact = Math.sqrt(
        Math.pow(linvel.x - (otherLinvel?.x ?? 0), 2) +
          Math.pow(linvel.y - (otherLinvel?.y ?? 0), 2) +
          Math.pow(linvel.z - (otherLinvel?.z ?? 0), 2),
      );
      if (impact > 1.5) {
        current.collisionImpact = Math.max(current.collisionImpact ?? 0, impact);
      }
    },
    [telemetryRef],
  );

  useBeforePhysicsStep((stepWorld) => {
    const body = rigidBodyRef.current;
    const controller = controllerRef.current;
    if (!body || !controller) {
      return;
    }

    if (
      autoResetBelowY !== undefined &&
      body.translation().y < autoResetBelowY
    ) {
      handleReset();
    }

    const control = controls.current;
    if (isPlayer && control.throttle !== 0) {
      body.wakeUp();
    }

    const speed = controller.currentVehicleSpeed();
    const movingForward = speed > 0.5;
    const movingBackward = speed < -0.5;

    const speedRatio = clamp(Math.abs(speed) / physics.maxSpeed, 0, 1);
    const steeringAngle =
      control.steering * physics.maxSteeringAngle * (1 - speedRatio * 0.65);

    let engine = 0;
    if (control.throttle > 0) {
      if (movingBackward) {
        engine = 0;
        for (let i = 0; i < controller.numWheels(); i++) {
          controller.setWheelBrake(i, physics.brakingForce);
        }
      } else {
        const taper = 1 - Math.pow(speedRatio, 3);
        engine = control.throttle * physics.engineForce * taper;
      }
    } else if (control.throttle < 0) {
      if (movingForward) {
        engine = 0;
        for (let i = 0; i < controller.numWheels(); i++) {
          controller.setWheelBrake(i, physics.brakingForce);
        }
      } else {
        engine = control.throttle * physics.engineForce * 0.55;
      }
    }

    const handbrakeActive = control.handbrake > 0;
    for (let i = 0; i < controller.numWheels(); i++) {
      const slot = WHEEL_ORDER[i];
      controller.setWheelEngineForce(
        i,
        physics.driveWheels.includes(slot) ? engine : 0,
      );
      controller.setWheelSteering(
        i,
        FRONT_WHEELS.includes(slot) ? steeringAngle : 0,
      );
      const brake =
        control.brake +
        (handbrakeActive && REAR_WHEELS.includes(slot)
          ? (control.handbrake * physics.handbrakeForce) /
            physics.brakingForce
          : 0);
      controller.setWheelBrake(i, brake * physics.brakingForce);
    }

    controller.updateVehicle(
      stepWorld.timestep,
      QueryFilterFlags.EXCLUDE_KINEMATIC,
      undefined,
      (collider: Collider) => collider.parent() !== body,
    );
  });

  useFrame(() => {
    const body = rigidBodyRef.current;
    const controller = controllerRef.current;
    if (!body || !controller) {
      return;
    }
    const control = controls.current;
    const linvel = body.linvel();
    const telemetry: VehicleTelemetry = {
      speedKmh: Math.abs(controller.currentVehicleSpeed()) * 3.6,
      steering: control.steering,
      throttle: control.throttle,
      handbrake: control.handbrake,
      lateralSlip: Math.abs(linvel.x) + Math.abs(linvel.z),
    };
    onTelemetry?.(telemetry);
    if (telemetryRef) {
      telemetryRef.current = telemetry;
    }
  });

  const chassisVolume =
    physics.chassisHalfExtents[0] * 2 *
    physics.chassisHalfExtents[1] * 2 *
    physics.chassisHalfExtents[2] * 2;
  const chassisDensity = physics.mass / chassisVolume;

  return (
    <RigidBody
      ref={rigidBodyRef}
      type="dynamic"
      position={definition.worldPosition}
      rotation={definition.visualRotation}
      colliders={false}
      linearDamping={0.02}
      angularDamping={0.35}
      canSleep={!isPlayer}
    >
      <CuboidCollider
        args={physics.chassisHalfExtents}
        density={chassisDensity}
        friction={0.6}
        restitution={0.12}
        onCollisionEnter={handleCollision}
      />
      <group position={[0, physics.visualOffsetY, 0]}>
        <VehicleModel definition={definition} onLoad={onLoad} />
      </group>
    </RigidBody>
  );
});