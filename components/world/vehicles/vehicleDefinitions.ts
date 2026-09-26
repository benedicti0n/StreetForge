"use client";

import { useGLTF } from "@react-three/drei";

export type VehicleId = "race" | "police";

export type WheelSlot = "fl" | "fr" | "rl" | "rr";

export type Vector3Tuple = [number, number, number];

export interface VehiclePhysicsConfig {
  mass: number;
  /** Half extents of the simplified chassis collider (body-local). */
  chassisHalfExtents: Vector3Tuple;
  /** World Y of the center of mass above ground; the rigid body origin sits here. */
  centerOfMassY: number;
  /** Local Y offset of the visual model centre relative to the body origin. */
  visualOffsetY: number;
  wheelRadius: number;
  /** Body-local suspension connection points for each wheel. */
  wheelPositions: Record<WheelSlot, Vector3Tuple>;
  suspensionRestLength: number;
  suspensionStiffness: number;
  suspensionCompression: number;
  suspensionRelaxation: number;
  maxSuspensionTravel: number;
  maxSuspensionForce: number;
  frictionSlip: number;
  sideFrictionStiffness: number;
  engineForce: number;
  brakingForce: number;
  handbrakeForce: number;
  maxSteeringAngle: number;
  /** m/s — engine force is tapered to zero as this is approached. */
  maxSpeed: number;
  /** Wheels that receive engine force. */
  driveWheels: WheelSlot[];
}

export interface VehicleDefinition {
  id: VehicleId;
  label: string;
  modelPath: string;
  worldPosition: Vector3Tuple;
  visualScale: number;
  visualRotation: Vector3Tuple;
  visualOffset: Vector3Tuple;
  /** Names of the four wheel container Object3D nodes in the GLB hierarchy. */
  wheelNodeNames: [string, string, string, string];
  physics: VehiclePhysicsConfig;
}

export const VEHICLE_DEFINITIONS: Record<VehicleId, VehicleDefinition> = {
  race: {
    id: "race",
    label: "Entinity XF",
    modelPath: "/models/vehicles/race-car/race-car.glb",
    worldPosition: [0, 0.36, 4],
    visualScale: 0.0131,
    visualRotation: [0, Math.PI, 0],
    visualOffset: [-101.21, -46.945, 173.27],
    wheelNodeNames: ["wheel_rb", "wheel_rb_1", "wheel_rb_2", "wheel_rb_3"],
    physics: {
      mass: 1250,
      chassisHalfExtents: [0.85, 0.3, 1.9],
      centerOfMassY: 0.36,
      visualOffsetY: 0.25,
      wheelRadius: 0.38,
      wheelPositions: {
        fl: [-0.83, 0.25, 1.395],
        fr: [0.83, 0.25, 1.395],
        rl: [-0.83, 0.25, -1.571],
        rr: [0.83, 0.25, -1.571],
      },
      suspensionRestLength: 0.3,
      suspensionStiffness: 90,
      suspensionCompression: 6,
      suspensionRelaxation: 3.5,
      maxSuspensionTravel: 0.25,
      maxSuspensionForce: 8000,
      frictionSlip: 10,
      sideFrictionStiffness: 2.5,
      engineForce: 3200,
      brakingForce: 900,
      handbrakeForce: 1600,
      maxSteeringAngle: 0.62,
      maxSpeed: 46,
      driveWheels: ["fl", "fr", "rl", "rr"],
    },
  },
  police: {
    id: "police",
    label: "LSPD Police Interceptor",
    modelPath: "/models/vehicles/police-car/police-car.glb",
    worldPosition: [0, 0.481, 12],
    visualScale: 0.185,
    visualRotation: [0, Math.PI, 0],
    visualOffset: [-5.185, -3.98, 12.4],
    wheelNodeNames: ["wheel", "wheel_1", "wheel_2", "wheel_3"],
    physics: {
      mass: 1900,
      chassisHalfExtents: [0.9, 0.33, 2.0],
      centerOfMassY: 0.481,
      visualOffsetY: 0.25,
      wheelRadius: 0.34,
      wheelPositions: {
        fl: [-0.741, 0.25, 1.345],
        fr: [0.745, 0.25, 1.345],
        rl: [-0.741, 0.25, -1.245],
        rr: [0.745, 0.25, -1.245],
      },
      suspensionRestLength: 0.42,
      suspensionStiffness: 80,
      suspensionCompression: 5.5,
      suspensionRelaxation: 3.2,
      maxSuspensionTravel: 0.3,
      maxSuspensionForce: 9000,
      frictionSlip: 9,
      sideFrictionStiffness: 2,
      engineForce: 1900,
      brakingForce: 800,
      handbrakeForce: 1400,
      maxSteeringAngle: 0.55,
      maxSpeed: 42,
      driveWheels: ["rl", "rr"],
    },
  },
};

export const SCENE_VEHICLES: VehicleId[] = ["race", "police"];

export function preloadVehicles(): void {
  for (const definition of Object.values(VEHICLE_DEFINITIONS)) {
    useGLTF.preload(definition.modelPath);
  }
}