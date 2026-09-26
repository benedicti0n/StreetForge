"use client";

import { useEffect, useRef, useState } from "react";

export type MapCaptureFeedback = "captured" | "error" | null;

interface MapEditorHeaderProps {
  editorReady: boolean;
  feedback: MapCaptureFeedback;
  onReset: () => void;
  onBuildWorld: () => void;
}

const RESET_CONFIRM_TIMEOUT_MS = 3000;

export function MapEditorHeader({
  editorReady,
  feedback,
  onReset,
  onBuildWorld,
}: MapEditorHeaderProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);
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

  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-edge bg-panel px-4 py-2.5">
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold uppercase tracking-[0.2em] text-zinc-200">
          World Sketch
        </h1>
        <p className="truncate text-[11px] text-zinc-500">
          Draw the world you want to drive through.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={handleResetClick}
          disabled={!editorReady}
          aria-label={
            confirmingReset ? "Confirm: discard the current map" : "Start a new blank map"
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
            disabled={!editorReady}
            aria-label="Capture the current map for the future world-building pipeline"
            className="rounded-md bg-accent px-4 py-1.5 text-xs font-bold tracking-[0.15em] text-zinc-950 transition-colors hover:bg-amber-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            BUILD WORLD
          </button>
        </div>
      </div>
    </header>
  );
}