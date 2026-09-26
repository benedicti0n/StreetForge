"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useRef } from "react";
import { WorldScene } from "./WorldScene";
import { WorldViewportOverlay } from "./WorldViewportOverlay";

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
      <WorldViewportOverlay onResetView={handleResetView} />
    </section>
  );
}