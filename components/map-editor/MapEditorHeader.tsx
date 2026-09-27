"use client";

import { useEffect, useRef, useState } from "react";
import type { WorldGenerationState, GenerationMode } from "@/components/world/generation/useWorldGeneration";
import {
  readSplatQuality,
  writeSplatQuality,
  type SplatQuality,
} from "@/lib/worldlabs/splatQuality";

export type MapCaptureFeedback = "captured" | "error" | null;

interface MapEditorHeaderProps {
  editorReady: boolean;
  feedback: MapCaptureFeedback;
  generation: WorldGenerationState;
  generationActive: boolean;
  onModeChange: (mode: GenerationMode) => void;
  onReset: () => void;
  onBuildWorld: () => void;
}

const RESET_CONFIRM_TIMEOUT_MS = 3000;

const STEP_LABELS: Record<
  WorldGenerationState["phase"],
  { label: string; stepIndex: number }
> = {
  editing: { label: "", stepIndex: -1 },
  capturing: { label: "Reading the sketch", stepIndex: 0 },
  submitting: { label: "Starting generation", stepIndex: 1 },
  generating: { label: "Building the environment", stepIndex: 2 },
  fetchingWorld: { label: "Preparing collision", stepIndex: 3 },
  loadingWorld: { label: "Finding safe ground", stepIndex: 4 },
  worldReady: { label: "World ready", stepIndex: 5 },
  error: { label: "Generation failed", stepIndex: -1 },
};

export function MapEditorHeader({
  editorReady,
  feedback,
  generation,
  generationActive,
  onModeChange,
  onReset,
  onBuildWorld,
}: MapEditorHeaderProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [splatQuality, setSplatQuality] = useState<SplatQuality>(() =>
    readSplatQuality(),
  );
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) {
        clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

  const handleResetClick = () => {
    if (confirmingReset) {
      if (confirmTimerRef.current !== null) {
        clearTimeout(confirmTimerRef.current);
      }
      setConfirmingReset(false);
      onReset();
      return;
    }
    setConfirmingReset(true);
    confirmTimerRef.current = setTimeout(
      () => setConfirmingReset(false),
      RESET_CONFIRM_TIMEOUT_MS,
    );
  };

  const step = STEP_LABELS[generation.phase];
  const showProgress = generationActive || generation.phase === "error" || generation.phase === "worldReady";

  return (
    <div className="shrink-0 border-b border-edge bg-panel">
      <header className="flex items-center justify-between gap-4 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.35em] text-accent/80">
            StreetForge
          </p>
          <h1 className="truncate text-sm font-semibold uppercase tracking-[0.2em] text-zinc-200">
            World Sketch
          </h1>
          <p className="truncate text-[11px] text-zinc-500">
            Draw it. Drive it. Escape it. Sketch roads, terrain, ramps and
            landmarks &mdash; StreetForge will interpret your layout.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {generation.phase === "editing" && (
            <div
              role="group"
              aria-label="Playable splat quality"
              title="High uses the 500k splat tier; Low uses 100k for weaker GPUs."
              className="flex items-center rounded-md border border-edge bg-background p-0.5"
            >
              <button
                type="button"
                onClick={() => {
                  setSplatQuality("high");
                  writeSplatQuality("high");
                }}
                aria-pressed={splatQuality === "high"}
                className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                  splatQuality === "high"
                    ? "bg-panel-raised text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                High
              </button>
              <button
                type="button"
                onClick={() => {
                  setSplatQuality("low");
                  writeSplatQuality("low");
                }}
                aria-pressed={splatQuality === "low"}
                className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                  splatQuality === "low"
                    ? "bg-panel-raised text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Low
              </button>
            </div>
          )}
          {generation.phase === "editing" && (
            <div
              role="group"
              aria-label="World generation quality"
              className="flex items-center rounded-md border border-edge bg-background p-0.5"
            >
              <button
                type="button"
                onClick={() => onModeChange("draft")}
                aria-pressed={generation.mode === "draft"}
                className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                  generation.mode === "draft"
                    ? "bg-panel-raised text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Draft
              </button>
              <button
                type="button"
                onClick={() => onModeChange("final")}
                aria-pressed={generation.mode === "final"}
                className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                  generation.mode === "final"
                    ? "bg-panel-raised text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Final
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handleResetClick}
            disabled={!editorReady || generationActive}
            aria-label={
              confirmingReset
                ? "Confirm: discard the current map"
                : "Start a new blank map"
            }
            className={`min-w-[96px] rounded-md border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${
              confirmingReset
                ? "border-red-900 bg-red-950/60 text-red-300 hover:border-red-700"
                : "border-edge bg-panel-raised text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
            }`}
          >
            {confirmingReset ? "Confirm reset" : "New Map"}
          </button>
          <div className="flex items-center gap-3">
            <span
              aria-live="polite"
              className={`min-w-[88px] text-right text-[11px] ${
                feedback === "captured"
                  ? "text-emerald-400"
                  : feedback === "error"
                    ? "text-red-400"
                    : "text-transparent"
              }`}
            >
              {feedback === "captured"
                ? "Map captured"
                : feedback === "error"
                  ? "Capture failed"
                  : "\u00a0"}
            </span>
            <button
              type="button"
              onClick={onBuildWorld}
              disabled={!editorReady || generationActive}
              aria-label="Generate a 3D world from the current map"
              className="rounded-md bg-accent px-4 py-1.5 text-xs font-bold tracking-[0.15em] text-zinc-950 transition-colors hover:bg-amber-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generationActive ? "Building…" : "Build World"}
            </button>
          </div>
        </div>
      </header>
      {showProgress && (
        <div
          aria-live="polite"
          className="flex items-center gap-4 border-t border-edge/60 px-4 py-2"
        >
          {generation.phase === "error" ? (
            generation.error?.includes("WLT_API_KEY") ? (
              <p className="text-[11px] text-red-400">
                World generation is unavailable. Check the server
                configuration.
              </p>
            ) : (
              <p className="text-[11px] text-red-400">
                We couldn&rsquo;t forge this world. Your current world is
                still safe. Try again.
              </p>
            )
          ) : generation.phase === "worldReady" ? (
            <p className="text-[11px] text-emerald-400">
              World forged. Start the chase from the viewport.
            </p>
          ) : (
            <>
              <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                Forging your world
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {Object.entries(STEP_LABELS)
                  .filter(([phase]) =>
                    [
                      "capturing",
                      "submitting",
                      "generating",
                      "fetchingWorld",
                    ].includes(phase),
                  )
                  .map(([phase, info]) => {
                    const done = info.stepIndex < step.stepIndex;
                    const current = info.stepIndex === step.stepIndex;
                    return (
                      <span
                        key={phase}
                        className={`text-[10px] uppercase tracking-[0.15em] ${
                          done
                            ? "text-emerald-400"
                            : current
                              ? "text-zinc-200"
                              : "text-zinc-600"
                        }`}
                      >
                        {done ? "\u2713 " : ""}
                        {info.label}
                        {current &&
                          generation.phase === "generating" &&
                          typeof generation.progress === "number" &&
                          ` ${Math.round(generation.progress)}%`}
                      </span>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}