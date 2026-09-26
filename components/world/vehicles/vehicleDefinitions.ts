"use client";

import { useGLTF } from "@react-three/drei";

export type VehicleId = "race" | "police";

export interface VehicleDefinition {
  id: VehicleId;
  label: string;
  modelPath: string;
  worldPosition: [number, number, number];
  visualScale: number;
  visualRotation: [number, number, number];
  visualOffset: [number, number, number];
}

export const VEHICLE_DEFINITIONS: Record<VehicleId, VehicleDefinition> = {
  race: {
    id: "race",
    label: "Entinity XF",
    modelPath: "/models/vehicles/race-car/race-car.glb",
    worldPosition: [0, 0.61, 4],
    visualScale: 0.0131,
    visualRotation: [0, Math.PI, 0],
    visualOffset: [-101.21, -46.945, 173.27],
  },
  police: {
    id: "police",
    label: "LSPD Police Interceptor",
    modelPath: "/models/vehicles/police-car/police-car.glb",
    worldPosition: [0, 0.731, 12],
    visualScale: 0.185,
    visualRotation: [0, Math.PI, 0],
    visualOffset: [-5.185, -3.98, 12.4],
  },
};

export const SCENE_VEHICLES: VehicleId[] = ["race", "police"];

export function preloadVehicles(): void {
  for (const definition of Object.values(VEHICLE_DEFINITIONS)) {
    useGLTF.preload(definition.modelPath);
  }
}