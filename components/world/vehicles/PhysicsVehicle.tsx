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
  Vector3 as RapierVector3,
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
import { Group, Object3D, Quaternion, Vector3 } from "three";
import {
  VEHICLE_DEFINITIONS,
  type VehicleId,
  type WheelSlot,
} from "./vehicleDefinitions";
import {
  type VehicleControlRef,
  type VehicleTelemetry,
} from "./vehicleTypes";
import {
  VehicleModel,
  type VehicleWheelInfo,
} from "./VehicleModel";

export interface PhysicsVehicleHandle {
  reset(): void;
}

interface PhysicsVehicleProps {
  vehicle: VehicleId;
  controls: VehicleControlRef;
  isPlayer?: boolean;
  autoResetBelowY?: number;
  bodyRef?: RefObject<RapierRigidBody | null>;
  onLoad?: () => void;
  onTelemetry?: (telemetry: VehicleTelemetry) => void;
  telemetryRef?: RefObject<VehicleTelemetry | null>;
}

const WHEEL_ORDER: WheelSlot[] = ["fl", "fr", "rl", "rr"];
const FRONT_WHEELS: WheelSlot[] = ["fl", "fr"];
const REAR_WHEELS: WheelSlot[] = ["rl", "rr"];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

interface WheelVisualSetup {
  pivot: Group;
  node: Object3D;
  baseQuaternion: Quaternion;
}

const _spinQuaternion = new Quaternion();
const _baseQuaternion = new Quaternion();
const _xAxis = new Vector3(1, 0, 0);
const _rightVector = new Vector3();
const _telemetryQuaternion = new Quaternion();

export const PhysicsVehicle = forwardRef<
  PhysicsVehicleHandle,
  PhysicsVehicleProps
>(function PhysicsVehicle(
  {
    vehicle,
    controls,
    isPlayer = false,
    autoResetBelowY,
    bodyRef,
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
  const pivotRefs = useRef<Array<Group | null>>([null, null, null, null]);
  const wheelVisualSetups = useRef<Map<number, WheelVisualSetup>>(new Map());
  const appliedSteeringRef = useRef(0);

  const handleWheelsReady = useCallback((wheels: VehicleWheelInfo[]) => {
    const setups = new Map<number, WheelVisualSetup>();
    wheels.forEach((wheel, index) => {
      const pivot = pivotRefs.current[index];
      if (!pivot) {
        return;
      }
      const node = wheel.node;
      pivot.attach(node);
      pivot.position.add(node.position);
      node.position.set(0, 0, 0);
      setups.set(index, {
        pivot,
        node,
        baseQuaternion: node.quaternion.clone(),
      });
    });
    wheelVisualSetups.current = setups;
  }, []);

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
        new RapierVector3(position[0], position[1], position[2]),
        new RapierVector3(0, -1, 0),
        new RapierVector3(-1, 0, 0),
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
    appliedSteeringRef.current = steeringAngle;

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
    const rotation = body.rotation();
    _rightVector
      .set(1, 0, 0)
      .applyQuaternion(
        _telemetryQuaternion.set(
          rotation.x,
          rotation.y,
          rotation.z,
          rotation.w,
        ),
      );
    const lateralSlip = Math.abs(
      linvel.x * _rightVector.x +
        linvel.y * _rightVector.y +
        linvel.z * _rightVector.z,
    );
    const telemetry: VehicleTelemetry = {
      speedKmh: Math.abs(controller.currentVehicleSpeed()) * 3.6,
      steering: control.steering,
      throttle: control.throttle,
      handbrake: control.handbrake,
      lateralSlip,
    };
    onTelemetry?.(telemetry);
    if (telemetryRef) {
      telemetryRef.current = telemetry;
    }

    const raw = (
      controller as unknown as {
        raw: {
          num_wheels(): number;
          wheel_rotation(i: number): number;
          wheel_hard_point_ws(i: number): { x: number; y: number; z: number };
          wheel_suspension_length(i: number): number;
        };
      }
    ).raw;
    const bodyY = body.translation().y;
    const steering = appliedSteeringRef.current;
    for (let i = 0; i < 4; i++) {
      const setup = wheelVisualSetups.current.get(i);
      if (!setup) {
        continue;
      }
      const spin = raw.wheel_rotation(i);
      _baseQuaternion.copy(setup.baseQuaternion);
      _spinQuaternion.setFromAxisAngle(_xAxis, spin);
      setup.node.quaternion.copy(_baseQuaternion).multiply(_spinQuaternion);
      setup.pivot.rotation.y = FRONT_WHEELS.includes(WHEEL_ORDER[i])
        ? steering
        : 0;
      const hardPoint = raw.wheel_hard_point_ws(i);
      const suspensionLength = raw.wheel_suspension_length(i);
      setup.pivot.position.y =
        hardPoint.y - suspensionLength - bodyY;
    }
  });

  const chassisVolume =
    physics.chassisHalfExtents[0] * 2 *
    physics.chassisHalfExtents[1] * 2 *
    physics.chassisHalfExtents[2] * 2;
  const chassisDensity = physics.mass / chassisVolume;

  return (
    <RigidBody
      ref={(node) => {
        rigidBodyRef.current = node;
        if (bodyRef) {
          bodyRef.current = node;
        }
      }}
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
        <VehicleModel
          definition={definition}
          onLoad={onLoad}
          onWheelsReady={handleWheelsReady}
        />
      </group>
      {WHEEL_ORDER.map((slot, index) => (
        <group
          key={slot}
          ref={(node) => {
            pivotRefs.current[index] = node;
          }}
          position={physics.wheelPositions[slot]}
        />
      ))}
    </RigidBody>
  );
});