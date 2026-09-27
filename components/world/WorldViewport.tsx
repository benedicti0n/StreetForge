"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WorldScene } from "./WorldScene";
import { useWorldPipeline } from "./generation/WorldPipeline";
import { WorldViewportOverlay } from "./WorldViewportOverlay";
import { useVehicleKeyboard } from "./controls/useVehicleKeyboard";
import { useVehicleAudio } from "./audio/useVehicleAudio";
import { vehicleAudio } from "./audio/VehicleAudio";
import {
  SCENE_VEHICLES,
  VEHICLE_DEFINITIONS,
  preloadVehicles,
  type VehicleId,
} from "./vehicles/vehicleDefinitions";
import type { PhysicsVehicleHandle } from "./vehicles/PhysicsVehicle";
import type { SafeSpawnResult } from "./generated/SafeSpawnResolver";
import type { ChaseTelemetry } from "./police/PoliceChaseController";
import type { RapierRigidBody } from "@react-three/rapier";
import {
  IDLE_CONTROLS,
  type VehicleControlRef,
  type VehicleTelemetry,
} from "./vehicles/vehicleTypes";

type ControlsRef = React.ElementRef<typeof OrbitControls>;

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

function ViewportUnavailable() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <p className="max-w-[24ch] text-xs leading-relaxed text-zinc-500">
        3D rendering is unavailable in this browser.
      </p>
    </div>
  );
}

class WebGLErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <ViewportUnavailable />;
    }
    return this.props.children;
  }
}

export function WorldViewport() {
  const controlsRef = useRef<ControlsRef>(null);
  const viewportRef = useRef<HTMLElement>(null);
  const playerVehicleRef = useRef<PhysicsVehicleHandle | null>(null);
  const playerBodyRef = useRef<RapierRigidBody | null>(null);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [pendingVehicles, setPendingVehicles] = useState(
    SCENE_VEHICLES.length,
  );
  const [vehicleLoadFailed, setVehicleLoadFailed] = useState(false);
  const [driveMode, setDriveMode] = useState(false);
  const [sirenActive, setSirenActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const pipeline = useWorldPipeline();
  const [splatState, setSplatState] = useState<{
    worldId: string;
    ready: boolean;
  }>({ worldId: "", ready: false });
  const [colliderDebug, setColliderDebug] = useState(false);
  const [colliderInfo, setColliderInfo] = useState<{
    worldId: string;
    spawns: SafeSpawnResult;
    halfExtent: number;
  } | null>(null);
  const previousPhaseRef = useRef(pipeline.generationState.phase);

  const handleSplatReady = useCallback(() => {
    setSplatState({
      worldId: pipeline.generatedWorld?.worldId ?? "",
      ready: true,
    });
  }, [pipeline.generatedWorld]);

  const loadingWorld =
    pipeline.generatedWorld !== null &&
    !(
      splatState.worldId === pipeline.generatedWorld.worldId &&
      splatState.ready
    );

  const generationActive =
    pipeline.generationState.phase === "capturing" ||
    pipeline.generationState.phase === "submitting" ||
    pipeline.generationState.phase === "generating" ||
    pipeline.generationState.phase === "fetchingWorld";

  const worldReadyForGenerated =
    pipeline.generatedWorld !== null &&
    splatState.worldId === pipeline.generatedWorld.worldId &&
    splatState.ready &&
    colliderInfo?.worldId === pipeline.generatedWorld.worldId;

  const vehicleControlsRef = useMemo(
    () =>
      Object.fromEntries(
        SCENE_VEHICLES.map((id) => [
          id,
          { current: { ...IDLE_CONTROLS } },
        ]),
      ) as Record<VehicleId, VehicleControlRef>,
    [],
  );
  const playerTelemetryRef = useRef<VehicleTelemetry | null>(null);
  const policeTelemetryRef = useRef<VehicleTelemetry | null>(null);
  const policeBodyRef = useRef<RapierRigidBody | null>(null);
  const chaseTelemetryRef = useRef<ChaseTelemetry | null>(null);

  const handleEnterDriveMode = useCallback(() => {
    vehicleAudio.unlock();
    setDriveMode(true);
    setSirenActive(true);
    vehicleAudio.setSirenActive(true);
  }, []);

  const handleExitDriveMode = useCallback(() => {
    setDriveMode(false);
    setSirenActive(false);
    vehicleAudio.setSirenActive(false);
  }, []);

  const handleToggleSiren = useCallback(() => {
    vehicleAudio.unlock();
    setSirenActive((active) => {
      vehicleAudio.setSirenActive(!active);
      return !active;
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    vehicleAudio.unlock();
    setMuted((m) => {
      vehicleAudio.setMuted(!m);
      return !m;
    });
  }, []);

  useEffect(() => {
    const phase = pipeline.generationState.phase;
    if (
      generationActive &&
      previousPhaseRef.current !== phase &&
      driveMode
    ) {
      handleExitDriveMode();
    }
    previousPhaseRef.current = phase;
  }, [
    pipeline.generationState.phase,
    generationActive,
    driveMode,
    handleExitDriveMode,
  ]);

  useEffect(() => {
    if (worldReadyForGenerated && pipeline.worldMode === "sandbox") {
      pipeline.setWorldMode("generated");
    }
  }, [worldReadyForGenerated, pipeline]);

  useVehicleAudio({ playerTelemetryRef });

  const handleColliderReady = useCallback(
    (spawns: SafeSpawnResult, halfExtent: number) => {
      setColliderInfo({
        worldId: pipeline.generatedWorld?.worldId ?? "",
        spawns,
        halfExtent,
      });
    },
    [pipeline.generatedWorld],
  );

  const handleResetPlayerVehicle = useCallback(() => {
    playerVehicleRef.current?.reset();
  }, []);

  useEffect(() => {
    if (!driveMode) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !viewportRef.current) {
        return;
      }
      if (!viewportRef.current.contains(target)) {
        setDriveMode(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [driveMode]);

  useVehicleKeyboard(
    vehicleControlsRef.race,
    driveMode,
    handleResetPlayerVehicle,
    handleExitDriveMode,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setWebglAvailable(supportsWebGL());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    preloadVehicles();
  }, []);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      const message = event.message ?? "";
      const isVehicleAssetError = Object.values(VEHICLE_DEFINITIONS).some(
        (definition) => message.includes(definition.modelPath),
      );
      if (isVehicleAssetError) {
        event.preventDefault();
      }
    };
    window.addEventListener("error", handleWindowError);
    return () => window.removeEventListener("error", handleWindowError);
  }, []);

  const handleResetView = useCallback(() => {
    controlsRef.current?.reset();
  }, []);

  const handleVehicleLoaded = useCallback(() => {
    setPendingVehicles((count) => Math.max(0, count - 1));
  }, []);

  const handleVehicleLoadFailed = useCallback(() => {
    setVehicleLoadFailed(true);
    setPendingVehicles(0);
  }, []);

  return (
    <section
      ref={viewportRef}
      aria-label="3D world viewport"
      className="relative h-full min-h-0 w-full overflow-hidden bg-background"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-viewport-overlay]")) {
          return;
        }
        handleEnterDriveMode();
      }}
    >
      {webglAvailable === false ? (
        <ViewportUnavailable />
      ) : (
        <WebGLErrorBoundary>
          <Canvas
            camera={{
              position: [12, 8, -10],
              fov: 50,
              near: 0.1,
              far: 2000,
            }}
            dpr={[1, 2]}
            gl={{ antialias: false }}
          >
            <WorldScene
              generatedWorld={pipeline.generatedWorld}
              colliderDebug={colliderDebug}
              worldMode={pipeline.worldMode}
              generatedSpawns={colliderInfo?.spawns ?? null}
              generatedHalfExtent={colliderInfo?.halfExtent ?? null}
              onColliderReady={handleColliderReady}
              onSplatReady={handleSplatReady}
              controlsRef={controlsRef}
              vehicles={SCENE_VEHICLES}
              vehicleControls={vehicleControlsRef}
              playerVehicleRef={playerVehicleRef}
              playerBodyRef={playerBodyRef}
              playerTelemetryRef={playerTelemetryRef}
              policeTelemetryRef={policeTelemetryRef}
              policeBodyRef={policeBodyRef}
              chaseTelemetryRef={chaseTelemetryRef}
              driveMode={driveMode}
              onVehicleLoaded={handleVehicleLoaded}
              onVehicleLoadFailed={handleVehicleLoadFailed}
            />
          </Canvas>
          <WorldViewportOverlay
            onResetView={handleResetView}
            driveMode={driveMode}
            onEnterDriveMode={handleEnterDriveMode}
            onExitDriveMode={handleExitDriveMode}
            telemetryRef={playerTelemetryRef}
            chaseTelemetryRef={chaseTelemetryRef}
            loadingWorld={loadingWorld}
            generationActive={generationActive}
            colliderDebug={colliderDebug}
            onToggleColliderDebug={() => setColliderDebug((d) => !d)}
            sirenActive={sirenActive}
            onToggleSiren={handleToggleSiren}
            muted={muted}
            onToggleMute={handleToggleMute}
            loadingVehicles={pendingVehicles > 0}
            vehicleLoadFailed={vehicleLoadFailed}
          />
        </WebGLErrorBoundary>
      )}
    </section>
  );
}