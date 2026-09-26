"use client";

interface WorldViewportOverlayProps {
  onResetView: () => void;
}

export function WorldViewportOverlay({
  onResetView,
}: WorldViewportOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-400">
            3D World
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            Sandbox
          </p>
        </div>
        <button
          type="button"
          onClick={onResetView}
          aria-label="Reset view to the initial camera position"
          className="pointer-events-auto rounded-md border border-edge bg-panel-raised/90 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Reset View
        </button>
      </div>
      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">
        Orbit &bull; Pan &bull; Zoom
      </p>
    </div>
  );
}