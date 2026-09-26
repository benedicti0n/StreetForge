"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useRef } from "react";
import { WorldScene } from "./WorldScene";

type ControlsRef = React.ElementRef<typeof OrbitControls>;

export function WorldViewport() {
  const controlsRef = useRef<ControlsRef>(null);

  const handleResetView = useCallback(() => {
    controlsRef.current?.reset();
  }, []);

  return (
    <section
      aria-label="3D world viewport"
      className="relative h-full min-h-0 w-full overflow-hidden bg-background"
    >
      <Canvas
        camera={{
          position: [12, 10, 12],
          fov: 50,
          near: 0.1,
          far: 2000,
        }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <WorldScene controlsRef={controlsRef} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-end p-3">
        <button
          type="button"
          onClick={handleResetView}
          aria-label="Reset view to the initial camera position"
          className="pointer-events-auto rounded-md border border-edge bg-panel-raised/90 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Reset View
        </button>
      </div>
    </section>
  );
}