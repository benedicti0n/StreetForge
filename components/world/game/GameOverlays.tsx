"use client";

import { useEffect, useState, type RefObject } from "react";
import { useExperience } from "./ExperienceProvider";
import type { VehicleTelemetry } from "@/components/world/vehicles/vehicleTypes";
import type { ChaseTelemetry } from "@/components/world/police/PoliceChaseController";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

interface GameOverlaysProps {
  telemetryRef?: RefObject<VehicleTelemetry | null>;
  chaseTelemetryRef?: RefObject<ChaseTelemetry | null>;
}

export function GameOverlays({ telemetryRef, chaseTelemetryRef }: GameOverlaysProps) {
  void telemetryRef;
  void chaseTelemetryRef;
  const experience = useExperience();
  const reduced = useReducedMotion();
  const { state, countdownValue } = experience;

  return (
    <div
      data-viewport-overlay
      className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center"
    >
      {state === "world-ready" && (
        <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg border border-accent/40 bg-panel/90 px-8 py-6 text-center shadow-2xl backdrop-blur-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-400">
            World forged
          </p>
          <p className="max-w-[34ch] text-sm leading-relaxed text-zinc-300">
            Your sketch is now a drivable world. Take a look around, then start
            the chase.
          </p>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={experience.startChase}
              aria-label="Start the police pursuit"
              className="rounded-md bg-accent px-6 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-zinc-950 transition-colors hover:bg-amber-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Start Chase
            </button>
            <button
              type="button"
              onClick={experience.editWorld}
              aria-label="Return to the map editor"
              className="rounded-md border border-edge bg-panel-raised px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Edit Map
            </button>
          </div>
        </div>
      )}
    {state === "countdown" && (
        <div
          key={countdownValue}
          className={`text-center ${reduced ? "" : "animate-[sf-pop_0.9s_ease-out]"}`}
        >
          <p className="text-7xl font-black tabular-nums tracking-tight text-zinc-50 drop-shadow-[0_0_28px_rgba(217,119,6,0.55)]">
            {countdownValue}
          </p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.4em] text-zinc-400">
            The pursuit begins
          </p>
        </div>
      )}

      {state === "playing" && (
        <>
          <GameplayHud
            escapeProgress={experience.escapeProgress}
            reducedMotion={reduced}
          />
          <GoFlash reducedMotion={reduced} />
        </>
      )}
    </div>
  );
}

function ProgressBar({ progress, className }: { progress: number; className?: string }) {
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-black/40 ${className ?? ""}`}
      role="progressbar"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-150 ease-out"
        style={{
          width: `${Math.min(100, Math.max(0, progress * 100))}%`,
        }}
      />
    </div>
  );
}

function GameplayHud({
  escapeProgress,
  reducedMotion: _reducedMotion,
}: {
  escapeProgress: number;
  reducedMotion: boolean;
}) {
  const showEscape = escapeProgress > 0.04;
  if (!showEscape) {
    return null;
  }
  return (
    <div className="absolute inset-x-0 bottom-14 flex flex-col items-center gap-1.5 px-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-emerald-300">
        Get Away
      </p>
      <ProgressBar progress={escapeProgress} className="max-w-[260px]" />
    </div>
  );
}

function GoFlash({ reducedMotion }: { reducedMotion: boolean }) {
  const [showGo, setShowGo] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowGo(false), 1100);
    return () => window.clearTimeout(timer);
  }, []);
  if (!showGo) {
    return null;
  }
  return (
    <div
      className={`text-center ${reducedMotion ? "" : "animate-[sf-pop_0.5s_ease-out]"}`}
    >
      <p className="text-6xl font-black tracking-tight text-emerald-400 drop-shadow-[0_0_28px_rgba(16,185,129,0.5)]">
        GO
      </p>
    </div>
  );
}