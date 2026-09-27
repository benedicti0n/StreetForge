"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWorldPipeline } from "@/components/world/generation/WorldPipeline";
import type { WorldGenerationState } from "@/components/world/generation/useWorldGeneration";
import { vehicleAudio } from "@/components/world/audio/VehicleAudio";
import {
  BUST_CLOSE_DISTANCE_M,
  BUST_COLLISION_MULTIPLIER,
  BUST_CONTACT_WINDOW_MS,
  BUST_DECAY_SECONDS,
  BUST_HOLD_SECONDS,
  BUST_SLOW_SPEED_KMH,
  ESCAPE_DECAY_SECONDS,
  ESCAPE_DISTANCE_FACTOR,
  ESCAPE_DISTANCE_MAX,
  ESCAPE_DISTANCE_MIN,
  ESCAPE_HOLD_SECONDS,
  ESCAPE_MIN_DISPLACEMENT_M,
  ESCAPE_MIN_SPEED_KMH,
  type ExperienceState,
  type GameRefs,
  type GameResultStats,
  type GameWorldInfo,
} from "./experienceState";

const GENERATION_PHASES: WorldGenerationState["phase"][] = [
  "capturing",
  "submitting",
  "generating",
  "fetchingWorld",
  "loadingWorld",
];

const COUNTDOWN_TICK_MS = 1000;

const INTRO_STORAGE_KEY = "streetforge:intro:v1";

function readIntroDismissed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(INTRO_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

interface ExperienceApi {
  state: ExperienceState;
  countdownValue: number;
  escapeProgress: number;
  bustProgress: number;
  /** Seconds until the escape bar completes while it is filling, else null. */
  escapeSeconds: number | null;
  /** Seconds until the bust bar completes while it is filling, else null. */
  bustSeconds: number | null;
  result: GameResultStats | null;
  gameplayActive: boolean;
  introDismissed: boolean;
  dismissIntro: () => void;
  startChase: () => void;
  runItBack: () => void;
  editWorld: () => void;
  pauseToWorldReady: () => void;
  reportWorldAssetsReady: (worldId: string) => void;
  registerGameRefs: (refs: GameRefs) => void;
}

const ExperienceContext = createContext<ExperienceApi | null>(null);

export function useExperience(): ExperienceApi {
  const value = useContext(ExperienceContext);
  if (!value) {
    throw new Error("useExperience must be used within ExperienceProvider.");
  }
  return value;
}

interface ExperienceProviderProps {
  children: ReactNode;
}

export function ExperienceProvider({ children }: ExperienceProviderProps) {
  const pipeline = useWorldPipeline();
  const [state, setState] = useState<ExperienceState>("editing");
  const [countdownValue, setCountdownValue] = useState(3);
  const [escapeProgress, setEscapeProgress] = useState(0);
  const [bustProgress, setBustProgress] = useState(0);
  const [escapeSeconds, setEscapeSeconds] = useState<number | null>(null);
  const [bustSeconds, setBustSeconds] = useState<number | null>(null);
  const [result, setResult] = useState<GameResultStats | null>(null);
  // The intro's dismissed flag is read after mount only, so the server and
  // the first client render agree (no hydration mismatch).
  const [introDismissed, setIntroDismissed] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setIntroDismissed(readIntroDismissed());
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const gameRefsRef = useRef<GameRefs | null>(null);
  const [assetsReadyWorldId, setAssetsReadyWorldId] = useState<string | null>(
    null,
  );
  const playingStartedAtRef = useRef(0);
  const playingStartPositionRef = useRef<{
    x: number;
    z: number;
  } | null>(null);
  const statsRef = useRef({
    peakSpeedKmh: 0,
    closestPoliceMeters: Infinity,
  });
  const lastContactAtRef = useRef(0);
  const escapeProgressRef = useRef(0);
  const bustProgressRef = useRef(0);
  const escapeSecondsRef = useRef<number | null>(null);
  const bustSecondsRef = useRef<number | null>(null);

  const phase = pipeline.generationState.phase;
  const generatedWorld = pipeline.generatedWorld;

  const registerGameRefs = useCallback((refs: GameRefs) => {
    gameRefsRef.current = refs;
  }, []);

  const reportWorldAssetsReady = useCallback((worldId: string) => {
    setAssetsReadyWorldId(worldId);
  }, []);

  // Generation lifecycle → experience state.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (GENERATION_PHASES.includes(phase)) {
        if (state === "editing" || state === "world-ready") {
          setState("generating");
        }
        return;
      }
      if (phase === "error") {
        setState("editing");
        return;
      }
      if (phase === "editing") {
        if (state === "generating") {
          setState("editing");
        }
        return;
      }
      if (
        phase === "worldReady" &&
        generatedWorld &&
        (state === "editing" || state === "generating") &&
        assetsReadyWorldId === generatedWorld.worldId
      ) {
        setState("world-ready");
      }
    });
    return () => cancelAnimationFrame(id);
  }, [phase, generatedWorld, state, assetsReadyWorldId]);

  const resetVehiclesAndProgress = useCallback(() => {
    gameRefsRef.current?.playerVehicleRef.current?.reset();
    gameRefsRef.current?.policeVehicleRef.current?.reset();
    if (gameRefsRef.current?.chaseTelemetryRef) {
      gameRefsRef.current.chaseTelemetryRef.current = null;
    }
    setEscapeProgress(0);
    setBustProgress(0);
    escapeProgressRef.current = 0;
    bustProgressRef.current = 0;
    escapeSecondsRef.current = null;
    bustSecondsRef.current = null;
    setEscapeSeconds(null);
    setBustSeconds(null);
    setResult(null);
    statsRef.current = { peakSpeedKmh: 0, closestPoliceMeters: Infinity };
  }, []);

  const startChase = useCallback(() => {
    if (state !== "world-ready") {
      return;
    }
    // Unlock the audio context inside the START CHASE user gesture so the
    // engine/siren can play without autoplay restrictions.
    vehicleAudio.unlock();
    resetVehiclesAndProgress();
    setCountdownValue(3);
    setState("countdown");
  }, [state, resetVehiclesAndProgress]);

  const runItBack = useCallback(() => {
    // RUN IT BACK is also a user gesture - resume/unlock audio for the replay.
    vehicleAudio.unlock();
    resetVehiclesAndProgress();
    setCountdownValue(3);
    setState("countdown");
  }, [resetVehiclesAndProgress]);

  const editWorld = useCallback(() => {
    setState("editing");
    if (pipeline.worldMode !== "sandbox") {
      pipeline.setWorldMode("sandbox");
    }
  }, [pipeline]);

  const pauseToWorldReady = useCallback(() => {
    if (state === "playing" || state === "countdown") {
      setState("world-ready");
    }
  }, [state]);

  const dismissIntro = useCallback(() => {
    try {
      window.localStorage.setItem(INTRO_STORAGE_KEY, "1");
    } catch {
      // ignore storage failures
    }
    setIntroDismissed(true);
  }, []);

  // Countdown: 3 → 2 → 1 → GO → playing.
  useEffect(() => {
    if (state !== "countdown") {
      return;
    }
    const rafId = requestAnimationFrame(() => setCountdownValue(3));
    let tick = 0;
    const interval = window.setInterval(() => {
      tick += 1;
      const remaining = 3 - tick;
      if (remaining > 0) {
        setCountdownValue(remaining);
        return;
      }
      window.clearInterval(interval);
      playingStartedAtRef.current = performance.now();
      const playerPosition = gameRefsRef.current?.playerBodyRef.current?.translation();
      playingStartPositionRef.current = playerPosition
        ? { x: playerPosition.x, z: playerPosition.z }
        : null;
      setState("playing");
    }, COUNTDOWN_TICK_MS);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearInterval(interval);
    };
  }, [state]);

  const finishGame = useCallback((outcome: "escaped" | "busted") => {
    setState(outcome);
    setResult({
      outcome,
      peakSpeedKmh: Math.round(statsRef.current.peakSpeedKmh),
      durationSeconds: Math.max(
        1,
        Math.round((performance.now() - playingStartedAtRef.current) / 1000),
      ),
      closestPoliceMeters: Math.round(statsRef.current.closestPoliceMeters),
    });
    setEscapeProgress(0);
    setBustProgress(0);
  }, []);

  // Escape / bust detection loop while playing.
  useEffect(() => {
    if (state !== "playing") {
      return;
    }
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const refs = gameRefsRef.current;
      const chase = refs?.chaseTelemetryRef.current;
      const playerTelemetry = refs?.playerTelemetryRef.current;
      const policeTelemetry = refs?.policeTelemetryRef.current;
      const worldInfo = refs?.worldInfoRef.current;

      const distance = chase?.distanceToPlayer ?? Infinity;
      const playerSpeedKmh = playerTelemetry?.speedKmh ?? 0;
      const playerGrounded = (playerTelemetry?.groundedWheels ?? 0) > 0;
      const policeContactImpact = policeTelemetry?.collisionImpact;
      if (policeContactImpact !== undefined) {
        lastContactAtRef.current = now;
        if (policeTelemetry) {
          policeTelemetry.collisionImpact = undefined;
        }
      }
      const recentContact =
        now - lastContactAtRef.current < BUST_CONTACT_WINDOW_MS;

      statsRef.current.peakSpeedKmh = Math.max(
        statsRef.current.peakSpeedKmh,
        playerSpeedKmh,
      );
      if (Number.isFinite(distance)) {
        statsRef.current.closestPoliceMeters = Math.min(
          statsRef.current.closestPoliceMeters,
          distance,
        );
      }

      if (worldInfo) {
        const escapeDistance = Math.min(
          ESCAPE_DISTANCE_MAX,
          Math.max(
            ESCAPE_DISTANCE_MIN,
            worldInfo.halfExtent * ESCAPE_DISTANCE_FACTOR,
          ),
        );
        const playerPosition = refs?.playerBodyRef.current?.translation();
        let displaced = true;
        if (playerPosition && playingStartPositionRef.current) {
          const dx = playerPosition.x - playingStartPositionRef.current.x;
          const dz = playerPosition.z - playingStartPositionRef.current.z;
          displaced = Math.hypot(dx, dz) > ESCAPE_MIN_DISPLACEMENT_M;
        }
        const playerActive =
          playerGrounded &&
          (playerSpeedKmh > ESCAPE_MIN_SPEED_KMH || displaced);

        // ESCAPE
        if (distance > escapeDistance && playerActive) {
          escapeProgressRef.current = Math.min(
            1,
            escapeProgressRef.current + dt / ESCAPE_HOLD_SECONDS,
          );
          // Seconds until the bar completes at the current fill rate.
          escapeSecondsRef.current = Math.max(
            0,
            (1 - escapeProgressRef.current) * ESCAPE_HOLD_SECONDS,
          );
        } else {
          escapeProgressRef.current = Math.max(
            0,
            escapeProgressRef.current - dt / ESCAPE_DECAY_SECONDS,
          );
          escapeSecondsRef.current = null;
        }

        // BUST
        const captureCondition =
          distance < BUST_CLOSE_DISTANCE_M &&
          playerSpeedKmh < BUST_SLOW_SPEED_KMH &&
          playerGrounded;
        if (captureCondition) {
          const multiplier = recentContact
            ? BUST_COLLISION_MULTIPLIER
            : 1;
          bustProgressRef.current = Math.min(
            1,
            bustProgressRef.current +
              (dt / BUST_HOLD_SECONDS) * multiplier,
          );
          bustSecondsRef.current = Math.max(
            0,
            (1 - bustProgressRef.current) * (BUST_HOLD_SECONDS / multiplier),
          );
        } else {
          bustProgressRef.current = Math.max(
            0,
            bustProgressRef.current - dt / BUST_DECAY_SECONDS,
          );
          bustSecondsRef.current = null;
        }
      }

      setEscapeProgress(escapeProgressRef.current);
      setBustProgress(bustProgressRef.current);
      setEscapeSeconds(escapeSecondsRef.current);
      setBustSeconds(bustSecondsRef.current);
      if (escapeProgressRef.current >= 1) {
        finishGame("escaped");
        return;
      }
      if (bustProgressRef.current >= 1) {
        finishGame("busted");
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state, finishGame]);

  const gameplayActive =
    state === "countdown" ||
    state === "playing" ||
    state === "escaped" ||
    state === "busted";

  const value = useMemo<ExperienceApi>(
    () => ({
      state,
      countdownValue,
      escapeProgress,
      bustProgress,
      escapeSeconds,
      bustSeconds,
      result,
      gameplayActive,
      introDismissed,
      dismissIntro,
      startChase,
      runItBack,
      editWorld,
      pauseToWorldReady,
      reportWorldAssetsReady,
      registerGameRefs,
    }),
    [
      state,
      countdownValue,
      escapeProgress,
      bustProgress,
      escapeSeconds,
      bustSeconds,
      result,
      gameplayActive,
      introDismissed,
      dismissIntro,
      startChase,
      runItBack,
      editWorld,
      pauseToWorldReady,
      reportWorldAssetsReady,
      registerGameRefs,
    ],
  );

  return (
    <ExperienceContext.Provider value={value}>
      {children}
    </ExperienceContext.Provider>
  );
}

export type { GameWorldInfo };