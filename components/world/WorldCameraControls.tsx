"use client";

import { OrbitControls } from "@react-three/drei";
import { useEffect, type RefObject } from "react";

type ControlsRef = React.ElementRef<typeof OrbitControls>;

export function WorldCameraControls({
  controlsRef,
}: {
  controlsRef: RefObject<ControlsRef | null>;
}) {
  useEffect(() => {
    controlsRef.current?.saveState();
  }, [controlsRef]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      panSpeed={0.6}
      zoomSpeed={0.7}
      minDistance={4}
      maxDistance={200}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2 - 0.05}
      target={[0, 0.9, 7]}
    />
  );
}