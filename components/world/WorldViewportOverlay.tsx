"use client";

import { useEffect, useState, type RefObject } from "react";
import type { VehicleTelemetry } from "./vehicles/vehicleTypes";

interface WorldViewportOverlayProps {
  onResetView: () => void;
  driveMode?: boolean;
  onEnterDriveMode?: () => void;
  onExitDriveMode?: () => void;
  telemetryRef?: RefObject<VehicleTelemetry | null>;
  sirenActive?: boolean;
  onToggleSiren?: () => void;
  muted?: boolean;
  onToggleMute?: () => void;
  loadingVehicles?: boolean;
  vehicleLoadFailed?: boolean;
}

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

export function WorldViewportOverlay({
  onResetView,
  driveMode = false,
  onEnterDriveMode,
  onExitDriveMode,
  telemetryRef,
  sirenActive = false,
  onToggleSiren,
  muted = false,
  onToggleMute,
  loadingVehicles = false,
  vehicleLoadFailed = false,
}: WorldViewportOverlayProps) {
  const speedKmh = useSpeedKmh(telemetryRef);
  return (
    <div
      data-viewport-overlay
      className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-400">
            3D World
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            Sandbox
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSiren?.();
            }}
            disabled={driveMode}
            aria-label={
              sirenActive
                ? "Police siren is active"
                : "Start the police siren"
            }
            title={driveMode ? "Siren runs automatically during pursuit" : undefined}
            className={`pointer-events-auto rounded-md border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              sirenActive
                ? "border-red-700 bg-red-950/60 text-red-300"
                : "border-edge bg-panel-raised/90 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            }`}
          >
            Siren
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleMute?.();
            }}
            aria-label={muted ? "Unmute vehicle audio" : "Mute vehicle audio"}
            className="pointer-events-auto rounded-md border border-edge bg-panel-raised/90 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {muted ? "Sound" : "Mute"}
          </button>
          {driveMode ? (
            <>
              <span className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                Drive Mode
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onExitDriveMode?.();
                }}
                aria-label="Return to inspection mode"
                className="pointer-events-auto rounded-md border border-edge bg-panel-raised/90 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Inspect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEnterDriveMode?.();
              }}
              aria-label="Activate driving mode and vehicle controls"
              className="pointer-events-auto rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-accent transition-colors hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Drive
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onResetView();
            }}
            aria-label="Reset view to the initial camera position"
            className="pointer-events-auto rounded-md border border-edge bg-panel-raised/90 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Reset View
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">
          {driveMode ? (
            <span className="text-zinc-500">
              WASD Drive &bull; Space Handbrake &bull; R Reset &bull; Esc Inspect
            </span>
          ) : (
            <>Orbit &bull; Pan &bull; Zoom</>
          )}
        </p>
        {driveMode && (
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Speed
            </span>
            <span className="font-mono text-lg font-semibold tabular-nums text-zinc-100">
              {speedKmh}
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              km/h
            </span>
          </div>
        )}
        {vehicleLoadFailed ? (
          <p className="text-[10px] uppercase tracking-[0.2em] text-red-400/90">
            Vehicle models failed to load
          </p>
        ) : loadingVehicles ? (
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Loading vehicles&hellip;
          </p>
        ) : null}
      </div>
    </div>
  );
}