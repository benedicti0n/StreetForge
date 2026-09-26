"use client";

import { Canvas } from "@react-three/fiber";
import { WorldScene } from "./WorldScene";

export function WorldViewport() {
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
        <WorldScene />
      </Canvas>
    </section>
  );
}