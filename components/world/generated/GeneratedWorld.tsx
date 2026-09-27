"use client";

import { useCallback, useMemo, useState } from "react";
import { Vector3 } from "three";
import type { SplatMesh as SparkSplatMesh } from "@sparkjsdev/spark";
import type { GeneratedWorldDescriptor } from "@/lib/worldlabs/types";
import {
  createWorldTransform,
  selectSplatUrl,
  type ResolvedWorldTransform,
  type WorldTransform,
} from "./worldTransform";
import { WorldCollider } from "./WorldCollider";
import type { SafeSpawnResult } from "./SafeSpawnResolver";

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
  const initialTransform = useMemo(
    () => createWorldTransform(descriptor),
    [descriptor],
  );
  const [resolved, setResolved] = useState<ResolvedWorldTransform | null>(null);
  const splatUrl = useMemo(() => selectSplatUrl(descriptor), [descriptor]);

  // The collider resolves the final metric transform (semantics when
  // present, measured fallback otherwise). The splat must use the SAME
  // transform so both assets stay aligned.
  const transform: WorldTransform = useMemo(() => {
    if (!resolved) {
      return initialTransform;
    }
    return {
      position: new Vector3(0, -resolved.groundOffsetY, 0),
      quaternion: initialTransform.quaternion,
      scale: resolved.scale,
    };
  }, [resolved, initialTransform]);

  const handleLoad = useCallback(
    (mesh: SparkSplatMesh) => {
      const numSplats = mesh.splats?.getNumSplats?.() ?? 0;
      if (numSplats > 0) {
        onSplatReady?.();
      }
    },
    [onSplatReady],
  );

  // Spark's SplatMesh re-creates (and re-fetches its URL) whenever the args
  // identity changes, so the args must stay referentially stable across
  // parent re-renders.
  const splatArgs = useMemo<
    [{ url: string | undefined; onLoad: (mesh: SparkSplatMesh) => void }]
  >(
    () => [{ url: splatUrl ?? undefined, onLoad: handleLoad }],
    [splatUrl, handleLoad],
  );

  return (
    <>
      <group
        position={transform.position}
        quaternion={transform.quaternion}
        scale={transform.scale}
      >
        {splatUrl && (
          <splatMesh args={splatArgs} />
        )}
      </group>
      <WorldCollider
        descriptor={descriptor}
        debug={colliderDebug}
        onReady={onColliderReady}
        onTransformResolved={setResolved}
        onError={onColliderError}
      />
    </>
  );
}