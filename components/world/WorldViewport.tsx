"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { WorldScene } from "./WorldScene";
import { WorldViewportOverlay } from "./WorldViewportOverlay";
import {
  SCENE_VEHICLES,
  preloadVehicles,
} from "./vehicles/vehicleDefinitions";

type ControlsRef = React.ElementRef<typeof OrbitControls>;

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

function ViewportUnavailable() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <p className="max-w-[24ch] text-xs leading-relaxed text-zinc-500">
        3D rendering is unavailable in this browser.
      </p>
    </div>
  );
}

class WebGLErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <ViewportUnavailable />;
    }
    return this.props.children;
  }
}

export function WorldViewport() {
  const controlsRef = useRef<ControlsRef>(null);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [pendingVehicles, setPendingVehicles] = useState(
    SCENE_VEHICLES.length,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setWebglAvailable(supportsWebGL());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    preloadVehicles();
  }, []);

  const handleResetView = useCallback(() => {
    controlsRef.current?.reset();
  }, []);

  const handleVehicleLoaded = useCallback(() => {
    setPendingVehicles((count) => Math.max(0, count - 1));
  }, []);

  return (
    <section
      aria-label="3D world viewport"
      className="relative h-full min-h-0 w-full overflow-hidden bg-background"
    >
      {webglAvailable === false ? (
        <ViewportUnavailable />
      ) : (
        <WebGLErrorBoundary>
          <Canvas
            camera={{
              position: [14, 9, -12],
              fov: 50,
              near: 0.1,
              far: 2000,
            }}
            dpr={[1, 2]}
            gl={{ antialias: true }}
          >
            <WorldScene
              controlsRef={controlsRef}
              vehicles={SCENE_VEHICLES}
              onVehicleLoaded={handleVehicleLoaded}
            />
          </Canvas>
          <WorldViewportOverlay
            onResetView={handleResetView}
            loadingVehicles={pendingVehicles > 0}
          />
        </WebGLErrorBoundary>
      )}
    </section>
  );
}