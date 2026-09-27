"use client";

import { useEffect, useState, type RefObject } from "react";
import type { VehicleTelemetry } from "./vehicles/vehicleTypes";
import type { ChaseTelemetry } from "./police/PoliceChaseController";

interface WorldViewportOverlayProps {
  onResetView: () => void;
  modeLabel?: string;
  sandboxDrive?: boolean;
  onEnterSandboxDrive?: () => void;
  onExitSandboxDrive?: () => void;
  telemetryRef?: RefObject<VehicleTelemetry | null>;
  chaseTelemetryRef?: RefObject<ChaseTelemetry | null>;
  sirenActive?: boolean;
  onToggleSiren?: () => void;
  muted?: boolean;
  onToggleMute?: () => void;
  loadingWorld?: boolean;
  worldLoadError?: string | null;
  generationActive?: boolean;
  colliderDebug?: boolean;
  onToggleColliderDebug?: () => void;
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

export function WorldViewportOverlay({
  onResetView,
  modeLabel = "Sandbox",
  sandboxDrive = false,
  onEnterSandboxDrive,
  onExitSandboxDrive,
  telemetryRef,
  chaseTelemetryRef,
  sirenActive = false,
  onToggleSiren,
  muted = false,
  onToggleMute,
  loadingWorld = false,
  worldLoadError = null,
  generationActive = false,
  colliderDebug = false,
  onToggleColliderDebug,
  loadingVehicles = false,
  vehicleLoadFailed = false,
}: WorldViewportOverlayProps) {
  const speedKmh = useSpeedKmh(telemetryRef);
  const police = usePoliceDistance(chaseTelemetryRef);
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
            {modeLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSiren?.();
            }}
            disabled={sandboxDrive}
            aria-label={
              sirenActive
                ? "Police siren is active"
                : "Start the police siren"
            }
            title={sandboxDrive ? "Siren runs automatically during pursuit" : undefined}
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
          {sandboxDrive ? (
            <>
              <span className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                Drive Mode
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onExitSandboxDrive?.();
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
                onEnterSandboxDrive?.();
              }}
              disabled={generationActive}
              aria-label="Activate driving mode and vehicle controls"
              className="pointer-events-auto rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-accent transition-colors hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generationActive ? "Generating…" : "Drive"}
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
          {sandboxDrive ? (
            <span className="text-zinc-500">
              WASD Drive &bull; Space Handbrake &bull; R Reset &bull; Esc Inspect
            </span>
          ) : (
            <>Orbit &bull; Pan &bull; Zoom</>
          )}
        </p>
        {sandboxDrive && (
          <div className="flex items-baseline gap-3">
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
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                {police.state === "recovery" ? "Recovery" : "Pursuit"}
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Police
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums text-zinc-100">
                {police.distance}
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                m
              </span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          {onToggleColliderDebug && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleColliderDebug();
              }}
              aria-label={
                colliderDebug
                  ? "Hide the generated collider overlay"
                  : "Show the generated collider overlay"
              }
              className={`pointer-events-auto rounded-md border px-2 py-1 text-[9px] font-medium uppercase tracking-[0.15em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                colliderDebug
                  ? "border-red-800 bg-red-950/50 text-red-300"
                  : "border-edge bg-panel-raised/80 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Collider
            </button>
          )}
          {worldLoadError ? (
            <p className="text-[10px] uppercase tracking-[0.2em] text-red-400/90">
              {worldLoadError}
            </p>
          ) : loadingWorld ? (
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Loading world&hellip;
            </p>
          ) : vehicleLoadFailed ? (
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
    </div>
  );
}