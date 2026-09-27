"use client";

import { Grid, OrbitControls } from "@react-three/drei";
import {
  Component,
  Suspense,
  type ReactNode,
  type RefObject,
} from "react";
import { PhysicsVehicle, type PhysicsVehicleHandle } from "./vehicles/PhysicsVehicle";
import { type VehicleId } from "./vehicles/vehicleDefinitions";
import {
  type VehicleControlRef,
  type VehicleTelemetry,
} from "./vehicles/vehicleTypes";
import type { RapierRigidBody } from "@react-three/rapier";
import { PhysicsWorld } from "./physics/PhysicsWorld";
import { WorldCameraControls } from "./WorldCameraControls";
import { VehicleFollowCamera } from "./camera/VehicleFollowCamera";

type ControlsRef = React.ElementRef<typeof OrbitControls>;

export const WORLD_GROUND_SIZE = 100;

class VehicleLoadErrorBoundary extends Component<
  { children: ReactNode; onFail?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail?.();
  }

  render() {
    if (this.state.failed) {
      return null;
    }
    return this.props.children;
  }
}

interface WorldSceneProps {
  controlsRef: RefObject<ControlsRef | null>;
  vehicles?: VehicleId[];
  vehicleControls: Record<VehicleId, VehicleControlRef>;
  playerVehicleRef?: RefObject<PhysicsVehicleHandle | null>;
  playerBodyRef?: RefObject<RapierRigidBody | null>;
  playerTelemetryRef?: RefObject<VehicleTelemetry | null>;
  driveMode?: boolean;
  onVehicleLoaded?: () => void;
  onVehicleLoadFailed?: () => void;
}

export function WorldScene({
  controlsRef,
  vehicles = [],
  vehicleControls,
  playerVehicleRef,
  playerBodyRef,
  playerTelemetryRef,
  driveMode = false,
  onVehicleLoaded,
  onVehicleLoadFailed,
}: WorldSceneProps) {
  return (
    <>
      <color attach="background" args={["#101013"]} />
      <WorldCameraControls controlsRef={controlsRef} enabled={!driveMode} />
      <VehicleFollowCamera
        bodyRef={playerBodyRef}
        telemetryRef={playerTelemetryRef}
        active={driveMode}
      />
      <hemisphereLight args={["#c9ced6", "#17171a", 1.1]} />
      <directionalLight
        position={[20, 30, 10]}
        intensity={2.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
      />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
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
      <PhysicsWorld>
        <VehicleLoadErrorBoundary onFail={onVehicleLoadFailed}>
          <Suspense fallback={null}>
            {vehicles.map((id) => (
              <PhysicsVehicle
                key={id}
                ref={id === "race" ? playerVehicleRef : undefined}
                vehicle={id}
                controls={vehicleControls[id]}
                isPlayer={id === "race"}
                autoResetBelowY={id === "race" ? -10 : undefined}
                bodyRef={id === "race" ? playerBodyRef : undefined}
                telemetryRef={id === "race" ? playerTelemetryRef : undefined}
                onLoad={onVehicleLoaded}
              />
            ))}
          </Suspense>
        </VehicleLoadErrorBoundary>
      </PhysicsWorld>
    </>
  );
}