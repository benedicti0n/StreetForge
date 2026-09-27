"use client";

import { useExperience } from "./ExperienceProvider";

interface GameOverlaysProps {
  telemetryRef?: never;
  chaseTelemetryRef?: never;
}

export function GameOverlays(_props: GameOverlaysProps) {
  const experience = useExperience();
  const { state } = experience;

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
    </div>
  );
}