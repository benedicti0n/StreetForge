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
import { useExperience } from "./game/ExperienceProvider";
import type { GameRefs, GameWorldInfo } from "./game/experienceState";
import { WorldViewportOverlay } from "./WorldViewportOverlay";
import { GameOverlays } from "./game/GameOverlays";
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

const WORLD_ASSET_LOAD_TIMEOUT_MS = 90_000;

export function WorldViewport() {
  const controlsRef = useRef<ControlsRef>(null);
  const viewportRef = useRef<HTMLElement>(null);
  const playerVehicleRef = useRef<PhysicsVehicleHandle | null>(null);
  const policeVehicleRef = useRef<PhysicsVehicleHandle | null>(null);
  const playerBodyRef = useRef<RapierRigidBody | null>(null);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [pendingVehicles, setPendingVehicles] = useState(
    SCENE_VEHICLES.length,
  );
  const [vehicleLoadFailed, setVehicleLoadFailed] = useState(false);
  const [sandboxDrive, setSandboxDrive] = useState(false);
  const [sirenActive, setSirenActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const pipeline = useWorldPipeline();
  const experience = useExperience();
  const [splatState, setSplatState] = useState<{
    worldId: string;
    ready: boolean;
  }>({ worldId: "", ready: false });
  const [colliderDebug, setColliderDebug] = useState(false);
  const [worldLoadError, setWorldLoadError] = useState<{
    worldId: string;
    message: string;
  } | null>(null);
  const [colliderInfo, setColliderInfo] = useState<{
    worldId: string;
    spawns: SafeSpawnResult;
    halfExtent: number;
  } | null>(null);
  const previousPhaseRef = useRef(pipeline.generationState.phase);
  const refreshAttemptsRef = useRef<Record<string, number>>({});
  const [worldAssetKey, setWorldAssetKey] = useState("");

  const { state: experienceState, gameplayActive } = experience;

  const handleSplatReady = useCallback(() => {
    setSplatState({
      worldId: pipeline.generatedWorld?.worldId ?? "",
      ready: true,
    });
  }, [pipeline.generatedWorld]);

  const activeWorldError =
    pipeline.generatedWorld !== null &&
    worldLoadError !== null &&
    worldLoadError.worldId === pipeline.generatedWorld.worldId
      ? worldLoadError.message
      : null;

  const loadingWorld =
    pipeline.generatedWorld !== null &&
    pipeline.generatedWorld.kind !== "procedural" &&
    activeWorldError === null &&
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
    colliderInfo?.worldId === pipeline.generatedWorld.worldId &&
    (pipeline.generatedWorld.kind === "procedural" ||
      (splatState.worldId === pipeline.generatedWorld.worldId &&
        splatState.ready));

  // Report asset readiness to the experience state machine.
  useEffect(() => {
    if (worldReadyForGenerated && pipeline.generatedWorld) {
      experience.reportWorldAssetsReady(pipeline.generatedWorld.worldId);
    }
  }, [worldReadyForGenerated, pipeline.generatedWorld, experience]);

  useEffect(() => {
    if (!pipeline.generatedWorld) {
      return;
    }
    if (pipeline.generatedWorld.kind === "procedural") {
      return;
    }
    if (worldReadyForGenerated) {
      return;
    }
    const timer = window.setTimeout(() => {
      setWorldLoadError({
        worldId: pipeline.generatedWorld?.worldId ?? "",
        message: "The generated world couldn't be loaded.",
      });
    }, WORLD_ASSET_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pipeline.generatedWorld, worldReadyForGenerated]);

  // Signed asset URLs can expire: on the first load failure, refresh the
  // world metadata once (same world id, zero new generations) and retry.
  useEffect(() => {
    if (!worldLoadError || !pipeline.generatedWorld) {
      return;
    }
    if (pipeline.generatedWorld.kind === "procedural") {
      return;
    }
    if (worldLoadError.worldId !== pipeline.generatedWorld.worldId) {
      return;
    }
    const worldId = pipeline.generatedWorld.worldId;
    const attempts = refreshAttemptsRef.current[worldId] ?? 0;
    if (attempts >= 1) {
      return;
    }
    refreshAttemptsRef.current[worldId] = attempts + 1;
    let cancelled = false;
    (async () => {
      const refreshed = await pipeline.refreshGeneratedWorld();
      if (!cancelled && refreshed) {
        setWorldLoadError(null);
        setSplatState({ worldId: "", ready: false });
        setWorldAssetKey(`${worldId}:r${refreshAttemptsRef.current[worldId]}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [worldLoadError, pipeline]);

  // On asset-load failure the experience returns to editing. The first
  // failure triggers a metadata refresh instead; only a second failure
  // falls back to editing.
  useEffect(() => {
    if (
      activeWorldError !== null &&
      experienceState === "generating" &&
      pipeline.generationState.phase === "worldReady" &&
      pipeline.generatedWorld !== null &&
      (refreshAttemptsRef.current[pipeline.generatedWorld.worldId] ?? 0) >= 1
    ) {
      pipeline.resetGeneration();
    }
  }, [activeWorldError, experienceState, pipeline]);

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
  const worldInfoRef = useRef<GameWorldInfo | null>(null);

  // Register all gameplay refs with the experience provider.
  useEffect(() => {
    experience.registerGameRefs({
      playerVehicleRef,
      policeVehicleRef,
      playerBodyRef,
      policeBodyRef,
      playerTelemetryRef,
      policeTelemetryRef,
      chaseTelemetryRef,
      worldInfoRef,
    } satisfies GameRefs);
  }, [experience]);

  // Keep the world info (bounds + spawns) available to the game logic.
  useEffect(() => {
    if (!colliderInfo || colliderInfo.worldId !== pipeline.generatedWorld?.worldId) {
      return;
    }
    worldInfoRef.current = {
      halfExtent: colliderInfo.halfExtent,
      playerSpawn: colliderInfo.spawns.player.position,
      policeSpawn: colliderInfo.spawns.police.position,
    };
  }, [colliderInfo, pipeline.generatedWorld]);

  const handleEnterSandboxDrive = useCallback(() => {
    if (experienceState !== "editing") {
      return;
    }
    vehicleAudio.unlock();
    setSandboxDrive(true);
    setSirenActive(true);
    vehicleAudio.setSirenActive(true);
  }, [experienceState]);

  const handleExitSandboxDrive = useCallback(() => {
    setSandboxDrive(false);
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

  // Siren lifecycle driven by the experience state.
  useEffect(() => {
    if (experienceState === "playing") {
      const id = requestAnimationFrame(() => {
        vehicleAudio.unlock();
        setSirenActive(true);
        vehicleAudio.setSirenActive(true);
      });
      return () => cancelAnimationFrame(id);
    }
    if (experienceState === "escaped") {
      const id = requestAnimationFrame(() => {
        setSirenActive(false);
        vehicleAudio.setSirenActive(false, 1.2);
      });
      return () => cancelAnimationFrame(id);
    }
    if (experienceState === "busted") {
      const timer = window.setTimeout(() => {
        setSirenActive(false);
        vehicleAudio.setSirenActive(false, 1.0);
      }, 1600);
      return () => window.clearTimeout(timer);
    }
    if (experienceState === "countdown") {
      const id = requestAnimationFrame(() => {
        setSirenActive(false);
        vehicleAudio.setSirenActive(false);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [experienceState]);

  useEffect(() => {
    const phase = pipeline.generationState.phase;
    if (
      generationActive &&
      previousPhaseRef.current !== phase &&
      sandboxDrive
    ) {
      handleExitSandboxDrive();
    }
    previousPhaseRef.current = phase;
  }, [
    pipeline.generationState.phase,
    generationActive,
    sandboxDrive,
    handleExitSandboxDrive,
  ]);

  useEffect(() => {
    if (worldReadyForGenerated && pipeline.worldMode === "sandbox") {
      pipeline.setWorldMode("generated");
    }
  }, [worldReadyForGenerated, pipeline]);

  useVehicleAudio({ playerTelemetryRef });

  // Feed the pursuit distance into the siren so it swells when the police
  // is close and eases off when they fall behind.
  useEffect(() => {
    if (!sirenActive) {
      return;
    }
    let raf = 0;
    const loop = () => {
      vehicleAudio.setSirenDistance(
        chaseTelemetryRef.current?.distanceToPlayer ?? 40,
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sirenActive]);

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

  const handleColliderError = useCallback(() => {
    const worldId = pipeline.generatedWorld?.worldId ?? "";
    setWorldLoadError({
      worldId,
      message: "This world couldn't be made driveable.",
    });
  }, [pipeline.generatedWorld]);

  const handleResetPlayerVehicle = useCallback(() => {
    playerVehicleRef.current?.reset();
  }, []);

  const handleExitGameplay = useCallback(() => {
    // ESC during a chase returns to inspect (world-ready).
    experience.pauseToWorldReady();
  }, [experience]);

  // During gameplay the viewport is full-bleed; only the sandbox drive
  // exits on outside clicks.
  useEffect(() => {
    if (!sandboxDrive) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !viewportRef.current) {
        return;
      }
      if (!viewportRef.current.contains(target)) {
        setSandboxDrive(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [sandboxDrive]);

  const playerControlsEnabled =
    experienceState === "playing" || sandboxDrive;

  useVehicleKeyboard(
    vehicleControlsRef.race,
    playerControlsEnabled,
    handleResetPlayerVehicle,
    experienceState === "playing" ? handleExitGameplay : handleExitSandboxDrive,
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
      className="relative h-full min-h-0 w-full flex-1 overflow-hidden bg-background"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-viewport-overlay]")) {
          return;
        }
        handleEnterSandboxDrive();
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
              onColliderError={handleColliderError}
              onSplatReady={handleSplatReady}
              worldAssetKey={worldAssetKey}
              controlsRef={controlsRef}
              vehicles={SCENE_VEHICLES}
              vehicleControls={vehicleControlsRef}
              playerVehicleRef={playerVehicleRef}
              policeVehicleRef={policeVehicleRef}
              playerBodyRef={playerBodyRef}
              playerTelemetryRef={playerTelemetryRef}
              policeTelemetryRef={policeTelemetryRef}
              policeBodyRef={policeBodyRef}
              chaseTelemetryRef={chaseTelemetryRef}
              followCameraActive={sandboxDrive || gameplayActive}
              chaseActive={experienceState === "playing"}
              onVehicleLoaded={handleVehicleLoaded}
              onVehicleLoadFailed={handleVehicleLoadFailed}
            />
          </Canvas>
          <GameOverlays
            telemetryRef={playerTelemetryRef}
            chaseTelemetryRef={chaseTelemetryRef}
          />
          <WorldViewportOverlay
            onResetView={handleResetView}
            modeLabel={
              pipeline.generationState.phase === "error"
                ? "Generation failed"
                : experienceState === "generating"
                  ? "Forging world"
                  : experienceState === "world-ready"
                    ? "Generated world"
                    : experienceState === "countdown"
                      ? "Get ready"
                      : experienceState === "playing"
                        ? "Pursuit"
                        : experienceState === "escaped"
                          ? "Escaped"
                          : experienceState === "busted"
                            ? "Busted"
                            : pipeline.worldMode === "generated"
                              ? "Generated world"
                              : "Sandbox"
            }
            sandboxDrive={sandboxDrive}
            onEnterSandboxDrive={handleEnterSandboxDrive}
            onExitSandboxDrive={handleExitSandboxDrive}
            telemetryRef={playerTelemetryRef}
            chaseTelemetryRef={chaseTelemetryRef}
            loadingWorld={loadingWorld}
            worldLoadError={activeWorldError}
            generationActive={generationActive}
            colliderDebug={colliderDebug}
            onToggleColliderDebug={() => setColliderDebug((d) => !d)}
            sirenActive={sirenActive}
            onToggleSiren={handleToggleSiren}
            muted={muted}
            onToggleMute={handleToggleMute}
            gameplayActive={gameplayActive}
            loadingVehicles={pendingVehicles > 0}
            vehicleLoadFailed={vehicleLoadFailed}
          />
        </WebGLErrorBoundary>
      )}
    </section>
  );
}