"use client";

import { useCallback, useMemo } from "react";
import type { GeneratedWorldDescriptor } from "@/lib/worldlabs/types";
import { createWorldTransform, selectSplatUrl } from "./worldTransform";
import { WorldCollider } from "./WorldCollider";
import type { SafeSpawnResult } from "./SafeSpawnResolver";

export type WorldAssetState = "loading" | "ready" | "error";

interface GeneratedWorldProps {
  descriptor: GeneratedWorldDescriptor;
  colliderDebug?: boolean;
  onSplatReady?: () => void;
  onColliderReady?: (spawns: SafeSpawnResult, halfExtent: number) => void;
  onColliderError?: () => void;
}

export function GeneratedWorld({
  descriptor,
  colliderDebug = false,
  onSplatReady,
  onColliderReady,
  onColliderError,
}: GeneratedWorldProps) {
  const transform = useMemo(() => createWorldTransform(descriptor), [descriptor]);
  const splatUrl = useMemo(() => selectSplatUrl(descriptor), [descriptor]);

  const handleLoad = useCallback(() => {
    onSplatReady?.();
  }, [onSplatReady]);

  return (
    <>
      <group
        position={transform.position}
        quaternion={transform.quaternion}
        scale={transform.scale}
      >
        {splatUrl && (
          <splatMesh args={[{ url: splatUrl, onLoad: handleLoad }]} />
        )}
      </group>
      <WorldCollider
        descriptor={descriptor}
        debug={colliderDebug}
        onReady={onColliderReady}
        onError={onColliderError}
      />
    </>
  );
}