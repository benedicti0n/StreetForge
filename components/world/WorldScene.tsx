"use client";

import { Grid, OrbitControls } from "@react-three/drei";
import { Suspense, type RefObject } from "react";
import { VehicleModel } from "./vehicles/VehicleModel";
import {
  VEHICLE_DEFINITIONS,
  type VehicleId,
} from "./vehicles/vehicleDefinitions";
import { WorldCameraControls } from "./WorldCameraControls";

type ControlsRef = React.ElementRef<typeof OrbitControls>;

export const WORLD_GROUND_SIZE = 100;

interface WorldSceneProps {
  controlsRef: RefObject<ControlsRef | null>;
  vehicles?: VehicleId[];
  onVehicleLoaded?: () => void;
}

export function WorldScene({
  controlsRef,
  vehicles = [],
  onVehicleLoaded,
}: WorldSceneProps) {
  return (
    <>
      <color attach="background" args={["#101013"]} />
      <WorldCameraControls controlsRef={controlsRef} />
      <hemisphereLight args={["#c9ced6", "#17171a", 0.55]} />
      <directionalLight position={[20, 30, 10]} intensity={1.4} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[WORLD_GROUND_SIZE, WORLD_GROUND_SIZE]} />
        <meshStandardMaterial color="#1c1c20" roughness={0.95} metalness={0} />
      </mesh>
      <Grid
        position={[0, 0.005, 0]}
        cellSize={2}
        cellThickness={0.6}
        cellColor="#2a2a30"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#3a3a42"
        fadeDistance={60}
        fadeStrength={2}
        infiniteGrid
        followCamera={false}
      />
      <Suspense fallback={null}>
        {vehicles.map((id) => (
          <VehicleModel
            key={id}
            definition={VEHICLE_DEFINITIONS[id]}
            onLoad={onVehicleLoaded}
          />
        ))}
      </Suspense>
    </>
  );
}