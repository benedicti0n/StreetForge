"use client";

import { Grid, OrbitControls } from "@react-three/drei";
import {
  Component,
  Suspense,
  useMemo,
  type ReactNode,
  type RefObject,
} from "react";
import { PhysicsVehicle, type PhysicsVehicleHandle } from "./vehicles/PhysicsVehicle";
import { GeneratedWorld } from "./generated/GeneratedWorld";
import type { SafeSpawnResult } from "./generated/SafeSpawnResolver";
import type { GeneratedWorldDescriptor } from "@/lib/worldlabs/types";
import type { WorldMode } from "./generation/WorldPipeline";
import { type VehicleId } from "./vehicles/vehicleDefinitions";
import {
  type VehicleControlRef,
  type VehicleTelemetry,
} from "./vehicles/vehicleTypes";
import type { RapierRigidBody } from "@react-three/rapier";
import { useThree } from "@react-three/fiber";
import { PhysicsWorld } from "./physics/PhysicsWorld";
import { WorldCameraControls } from "./WorldCameraControls";
import { VehicleFollowCamera } from "./camera/VehicleFollowCamera";
import {
  PoliceChaseController,
  type ChaseTelemetry,
} from "./police/PoliceChaseController";
import {
  WORLD_FALL_RESET_Y,
  WORLD_RESET_BOUNDS,
  WORLD_SIZE,
} from "./worldConstants";
import "./spark/SparkElements";

type ControlsRef = React.ElementRef<typeof OrbitControls>;

function SparkWorldRenderer() {
  const gl = useThree((state) => state.gl);
  const args = useMemo(() => ({ renderer: gl }), [gl]);
  return <sparkRenderer args={[args]} />;
}

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
  policeVehicleRef?: RefObject<PhysicsVehicleHandle | null>;
  playerBodyRef?: RefObject<RapierRigidBody | null>;
  playerTelemetryRef?: RefObject<VehicleTelemetry | null>;
  policeTelemetryRef?: RefObject<VehicleTelemetry | null>;
  policeBodyRef?: RefObject<RapierRigidBody | null>;
  chaseTelemetryRef?: RefObject<ChaseTelemetry | null>;
  followCameraActive?: boolean;
  chaseActive?: boolean;
  generatedWorld?: GeneratedWorldDescriptor | null;
  colliderDebug?: boolean;
  worldMode?: WorldMode;
  generatedSpawns?: SafeSpawnResult | null;
  generatedHalfExtent?: number | null;
  onColliderReady?: (spawns: SafeSpawnResult, halfExtent: number) => void;
  onSplatReady?: () => void;
  onVehicleLoaded?: () => void;
  onVehicleLoadFailed?: () => void;
}

export function WorldScene({
  controlsRef,
  vehicles = [],
  vehicleControls,
  playerVehicleRef,
  policeVehicleRef,
  playerBodyRef,
  playerTelemetryRef,
  policeTelemetryRef,
  policeBodyRef,
  chaseTelemetryRef,
  followCameraActive = false,
  chaseActive = false,
  generatedWorld,
  colliderDebug = false,
  worldMode = "sandbox",
  generatedSpawns = null,
  generatedHalfExtent = null,
  onColliderReady,
  onSplatReady,
  onVehicleLoaded,
  onVehicleLoadFailed,
}: WorldSceneProps) {
  return (
    <>
      <color attach="background" args={["#101013"]} />
      <SparkWorldRenderer />
      <WorldCameraControls controlsRef={controlsRef} enabled={!followCameraActive} />
      <VehicleFollowCamera
        bodyRef={playerBodyRef}
        telemetryRef={playerTelemetryRef}
        active={followCameraActive}
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
      {worldMode === "sandbox" && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
          <meshStandardMaterial
            color="#1c1c20"
            roughness={0.95}
            metalness={0}
          />
        </mesh>
      )}
      {worldMode === "sandbox" && <Grid
        position={[0, 0.005, 0]}
        cellSize={2}
        cellThickness={0.6}
        cellColor="#2a2a30"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#3a3a42"
        fadeDistance={80}
        fadeStrength={2}
        infiniteGrid
        followCamera={false}
      />}
      <PhysicsWorld hasGround={worldMode === "sandbox"}>
        {generatedWorld && (
          <GeneratedWorld
            descriptor={generatedWorld}
            colliderDebug={colliderDebug}
            onSplatReady={onSplatReady}
            onColliderReady={onColliderReady}
          />
        )}
        <PoliceChaseController
          active={chaseActive}
          playerBodyRef={playerBodyRef}
          policeBodyRef={policeBodyRef}
          policeControlsRef={vehicleControls.police}
          telemetryRef={chaseTelemetryRef}
        />
        <VehicleLoadErrorBoundary onFail={onVehicleLoadFailed}>
          <Suspense fallback={null}>
            {vehicles.map((id) => (
              <PhysicsVehicle
                key={id}
                ref={id === "race" ? playerVehicleRef : policeVehicleRef}
                vehicle={id}
                controls={vehicleControls[id]}
                isPlayer={id === "race"}
                autoResetBelowY={WORLD_FALL_RESET_Y}
                autoResetHalfExtent={
                  worldMode === "generated" && generatedHalfExtent
                    ? generatedHalfExtent
                    : WORLD_RESET_BOUNDS
                }
                spawnOverride={
                  generatedSpawns
                    ? id === "race"
                      ? generatedSpawns.player.position
                      : generatedSpawns.police.position
                    : undefined
                }
                bodyRef={
                  id === "race" ? playerBodyRef : policeBodyRef
                }
                telemetryRef={
                  id === "race" ? playerTelemetryRef : policeTelemetryRef
                }
                onLoad={onVehicleLoaded}
              />
            ))}
          </Suspense>
        </VehicleLoadErrorBoundary>
      </PhysicsWorld>
    </>
  );
}