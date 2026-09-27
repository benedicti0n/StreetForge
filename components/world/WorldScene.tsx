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
import { ProceduralWorld } from "./procedural/ProceduralWorld";
import type { SafeSpawnResult } from "./generated/SafeSpawnResolver";
import type { WorldDescriptor, WorldMode } from "./generation/WorldPipeline";
import { type VehicleId } from "./vehicles/vehicleDefinitions";
import {
  type VehicleControlRef,
  type VehicleTelemetry,
} from "./vehicles/vehicleTypes";
import type { RapierRigidBody } from "@react-three/rapier";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BackSide,
  CanvasTexture,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
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

/**
 * Lightweight built-in room environment used to give vehicle bodies gentle
 * reflections. No HDR downloads - three.js RoomEnvironment is procedural.
 */
/**
 * A simple stylized gradient sky dome (one textured backside sphere - no
 * expensive sky systems).
 */
function GradientSky() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    const gradient = context.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "#6FB8E8");
    gradient.addColorStop(0.55, "#A5D3F2");
    gradient.addColorStop(1, "#D8EEFB");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 8, 256);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, []);
  if (!texture) {
    return null;
  }
  return (
    <mesh>
      <sphereGeometry args={[900, 16, 12]} />
      <meshBasicMaterial
        map={texture}
        side={BackSide}
        fog={false}
        depthWrite={false}
      />
    </mesh>
  );
}

function SceneEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useFrame(() => {
    if (!scene.environment) {
      const pmrem = new PMREMGenerator(gl);
      const environmentScene = new Scene();
      environmentScene.add(new RoomEnvironment());
      const texture = pmrem.fromScene(environmentScene, 0.04).texture;
      scene.environment = texture;
      pmrem.dispose();
      environmentScene.clear();
    }
  });
  return null;
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
  generatedWorld?: WorldDescriptor | null;
  colliderDebug?: boolean;
  worldMode?: WorldMode;
  generatedSpawns?: SafeSpawnResult | null;
  generatedHalfExtent?: number | null;
  worldAssetKey?: string;
  onColliderReady?: (spawns: SafeSpawnResult, halfExtent: number) => void;
  onColliderError?: () => void;
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
  worldAssetKey = "",
  onColliderReady,
  onColliderError,
  onSplatReady,
  onVehicleLoaded,
  onVehicleLoadFailed,
}: WorldSceneProps) {
  const proceduralWorld = generatedWorld?.kind === "procedural";
  return (
    <>
      <color attach="background" args={[proceduralWorld ? "#8fc2ea" : "#101013"]} />
      {proceduralWorld ? (
        <fog attach="fog" args={["#d8eefb", 150, 280]} />
      ) : null}
      {proceduralWorld ? <GradientSky /> : null}
      <SceneEnvironment />
      <SparkWorldRenderer />
      <WorldCameraControls controlsRef={controlsRef} enabled={!followCameraActive} />
      <VehicleFollowCamera
        bodyRef={playerBodyRef}
        telemetryRef={playerTelemetryRef}
        active={followCameraActive}
      />
      {proceduralWorld ? (
        <>
          <hemisphereLight args={["#eaf5ff", "#5d8a4c", 1.25]} />
          <ambientLight intensity={0.18} />
        </>
      ) : (
        <hemisphereLight args={["#c9ced6", "#17171a", 1.1]} />
      )}
      <directionalLight
        position={[proceduralWorld ? 30 : 20, proceduralWorld ? 45 : 30, proceduralWorld ? 20 : 10]}
        intensity={proceduralWorld ? 2.3 : 2.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={proceduralWorld ? -110 : -30}
        shadow-camera-right={proceduralWorld ? 110 : 30}
        shadow-camera-top={proceduralWorld ? 110 : 30}
        shadow-camera-bottom={proceduralWorld ? -110 : -30}
        shadow-camera-near={1}
        shadow-camera-far={proceduralWorld ? 260 : 80}
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
        {generatedWorld && generatedWorld.kind === "procedural" ? (
          <ProceduralWorld
            key={generatedWorld.worldId}
            descriptor={generatedWorld}
            onReady={onColliderReady}
          />
        ) : generatedWorld ? (
          <GeneratedWorld
            key={worldAssetKey || generatedWorld.worldId}
            descriptor={generatedWorld}
            colliderDebug={colliderDebug}
            onSplatReady={onSplatReady}
            onColliderReady={onColliderReady}
            onColliderError={onColliderError}
          />
        ) : null}
        <PoliceChaseController
          active={chaseActive}
          playerBodyRef={playerBodyRef}
          policeBodyRef={policeBodyRef}
          policeControlsRef={vehicleControls.police}
          policeTelemetryRef={policeTelemetryRef}
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
                      ? generatedSpawns.player
                      : generatedSpawns.police
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