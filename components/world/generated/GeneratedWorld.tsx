"use client";

import { useCallback, useMemo } from "react";
import type { GeneratedWorldDescriptor } from "@/lib/worldlabs/types";
import { createWorldTransform, selectSplatUrl } from "./worldTransform";

interface GeneratedWorldProps {
  descriptor: GeneratedWorldDescriptor;
  onSplatReady?: () => void;
}

export function GeneratedWorld({
  descriptor,
  onSplatReady,
}: GeneratedWorldProps) {
  const transform = useMemo(() => createWorldTransform(descriptor), [descriptor]);
  const splatUrl = useMemo(() => selectSplatUrl(descriptor), [descriptor]);

  const handleLoad = useCallback(() => {
    onSplatReady?.();
  }, [onSplatReady]);

  return (
    <group
      position={transform.position}
      quaternion={transform.quaternion}
      scale={transform.scale}
    >
      {splatUrl && (
        <splatMesh args={[{ url: splatUrl, onLoad: handleLoad }]} />
      )}
    </group>
  );
}