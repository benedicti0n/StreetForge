"use client";

import { useEffect, useState, type RefObject } from "react";
import { useExperience } from "./ExperienceProvider";
import type { VehicleTelemetry } from "@/components/world/vehicles/vehicleTypes";
import type { ChaseTelemetry } from "@/components/world/police/PoliceChaseController";

function useSpeedKmh(telemetryRef?: RefObject<VehicleTelemetry | null>): number {
  const [speedKmh, setSpeedKmh] = useState(0);
  useEffect(() => {
    if (!telemetryRef) {
      return;
    }
    let raf = 0;
    const loop = () => {
      setSpeedKmh(Math.round(telemetryRef.current?.speedKmh ?? 0));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [telemetryRef]);
  return speedKmh;
}

function usePoliceDistance(
  chaseTelemetryRef?: RefObject<ChaseTelemetry | null>,
): { distance: number; state: string } {
  const [value, setValue] = useState({ distance: 0, state: "idle" });
  useEffect(() => {
    if (!chaseTelemetryRef) {
      return;
    }
    let raf = 0;
    const loop = () => {
      const telemetry = chaseTelemetryRef.current;
      setValue({
        distance: Math.round(telemetry?.distanceToPlayer ?? 0),
        state: telemetry?.state ?? "idle",
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [chaseTelemetryRef]);
  return value;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rafId = requestAnimationFrame(() => setReduced(query.matches));
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => {
      cancelAnimationFrame(rafId);
      query.removeEventListener("change", onChange);
    };
  }, []);
  return reduced;
}

interface GameOverlaysProps {
  telemetryRef?: RefObject<VehicleTelemetry | null>;
  chaseTelemetryRef?: RefObject<ChaseTelemetry | null>;
}

export function GameOverlays({ telemetryRef, chaseTelemetryRef }: GameOverlaysProps) {
  const experience = useExperience();
  const reduced = useReducedMotion();
  const speedKmh = useSpeedKmh(telemetryRef);
  const police = usePoliceDistance(chaseTelemetryRef);
  const { state, countdownValue } = experience;

  return (
    <div
      data-viewport-overlay
      className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center"
    >
      {state === "generating" && (
        <div className="absolute bottom-6 flex items-center gap-2.5 rounded-full border border-accent/40 bg-panel/80 px-4 py-2 backdrop-blur-sm">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full bg-accent ${
              reduced ? "" : "animate-pulse"
            }`}
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-200">
            Forging your world
          </p>
        </div>
      )}

      {!experience.introDismissed && (
        <IntroOverlay
          onDismiss={experience.dismissIntro}
          reducedMotion={reduced}
        />
      )}

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
            speedKmh={speedKmh}
            policeDistance={police.distance}
            policeState={police.state}
            escapeProgress={experience.escapeProgress}
            bustProgress={experience.bustProgress}
            escapeSeconds={experience.escapeSeconds}
            bustSeconds={experience.bustSeconds}
          />
          <GoFlash reducedMotion={reduced} />
        </>
      )}

      {(state === "escaped" || state === "busted") && (
        <ResultOverlay reducedMotion={reduced} />
      )}
    </div>
  );
}

function IntroOverlay({
  onDismiss,
  reducedMotion,
}: {
  onDismiss: () => void;
  reducedMotion: boolean;
}) {
  return (
    <div
      className={`pointer-events-auto flex flex-col items-center gap-5 rounded-lg border border-edge bg-panel/95 px-10 py-9 text-center shadow-2xl backdrop-blur-sm ${
        reducedMotion ? "" : "animate-[sf-rise_0.4s_ease-out]"
      }`}
    >
      <p className="text-4xl font-black uppercase tracking-[0.18em] text-zinc-50">
        Street<span className="text-accent">Forge</span>
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-zinc-400">
        Draw it. Drive it. Escape it.
      </p>
      <div className="flex items-center gap-6">
        <IntroStep number="1" label="Sketch a world" />
        <IntroStep number="2" label="Forge it into 3D" />
        <IntroStep number="3" label="Outrun the police" />
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Start drawing your world"
        className="mt-2 rounded-md bg-accent px-7 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-zinc-950 transition-colors hover:bg-amber-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Forge a World
      </button>
    </div>
  );
}

function IntroStep({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/50 text-[11px] font-bold text-accent">
        {number}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
        {label}
      </span>
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
  speedKmh,
  policeDistance,
  policeState,
  escapeProgress,
  bustProgress,
  escapeSeconds,
  bustSeconds,
}: {
  speedKmh: number;
  policeDistance: number;
  policeState: string;
  escapeProgress: number;
  bustProgress: number;
  escapeSeconds: number | null;
  bustSeconds: number | null;
}) {
  const [showControls, setShowControls] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowControls(false), 6000);
    return () => window.clearTimeout(timer);
  }, []);
  const showEscape = escapeProgress > 0.04;
  const showBust = bustProgress > 0.04;

  return (
    <>
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div className="flex items-baseline gap-2 rounded-md border border-edge/70 bg-panel/70 px-3 py-1.5 backdrop-blur-sm">
          <span className="font-mono text-3xl font-bold tabular-nums leading-none text-zinc-50">
            {speedKmh}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            km/h
          </span>
        </div>
        <div className="flex items-baseline gap-2 rounded-md border border-accent/30 bg-panel/70 px-3 py-1.5 backdrop-blur-sm">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
            {policeState === "recovery" ? "Recovery" : "Pursuit"}
          </span>
          <span className="font-mono text-2xl font-bold tabular-nums leading-none text-zinc-50">
            {policeDistance}
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            m
          </span>
        </div>
      </div>

      {showEscape && (
        <div className="absolute inset-x-0 bottom-14 flex flex-col items-center gap-1.5 px-6">
          <div className="flex items-baseline gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-emerald-300">
              Get Away
            </p>
            {escapeSeconds !== null && (
              <p className="font-mono text-sm font-bold tabular-nums leading-none text-emerald-200">
                {escapeSeconds.toFixed(1)}s
              </p>
            )}
          </div>
          <ProgressBar progress={escapeProgress} className="max-w-[260px]" />
        </div>
      )}

      {showBust && !showEscape && (
        <div className="absolute inset-x-0 bottom-14 flex flex-col items-center gap-1.5 px-6">
          <div className="flex items-baseline gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-red-300">
              Police closing in
            </p>
            {bustSeconds !== null && (
              <p className="font-mono text-sm font-bold tabular-nums leading-none text-red-200">
                {bustSeconds.toFixed(1)}s
              </p>
            )}
          </div>
          <ProgressBar progress={bustProgress} className="max-w-[260px]" />
        </div>
      )}

      {showControls && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center">
          <p className="rounded-md border border-edge/70 bg-panel/70 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-400 backdrop-blur-sm">
            WASD Drive &bull; Space Handbrake &bull; R Reset &bull; Esc Inspect
          </p>
        </div>
      )}
    </>
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
function ResultOverlay({ reducedMotion }: { reducedMotion: boolean }) {
  const experience = useExperience();
  const result = experience.result;
  if (!result) {
    return null;
  }
  const escaped = result.outcome === "escaped";
  return (
    <div
      className={`pointer-events-auto flex flex-col items-center gap-3 rounded-lg border px-10 py-8 text-center shadow-2xl backdrop-blur-sm ${
        escaped ? "border-emerald-500/40" : "border-red-800/50"
      } bg-panel/90 ${reducedMotion ? "" : "animate-[sf-rise_0.35s_ease-out]"}`}
    >
      <p
        className={`text-5xl font-black uppercase tracking-[0.12em] ${
          escaped ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {escaped ? "Escaped" : "Busted"}
      </p>
      <p className="max-w-[36ch] text-sm leading-relaxed text-zinc-300">
        {escaped
          ? "You lost the pursuit. The streets are yours."
          : "They boxed you in. The pursuit is over."}
      </p>
      <div className="mt-1 flex items-center gap-6 text-center">
        <ResultStat label="Peak speed" value={`${result.peakSpeedKmh}`} unit="km/h" />
        <ResultStat label="Chase time" value={`${result.durationSeconds}`} unit="s" />
        <ResultStat label="Closest police" value={`${result.closestPoliceMeters}`} unit="m" />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={experience.runItBack}
          aria-label="Replay the pursuit in the same world"
          className="rounded-md bg-accent px-6 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-zinc-950 transition-colors hover:bg-amber-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Run It Back
        </button>
        <button
          type="button"
          onClick={experience.editWorld}
          aria-label="Return to the map editor"
          className="rounded-md border border-edge bg-panel-raised px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Edit World
        </button>
      </div>
    </div>
  );
}

function ResultStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </span>
      <span className="mt-1 font-mono text-xl font-bold tabular-nums text-zinc-50">
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
        {unit}
      </span>
    </div>
  );
}
