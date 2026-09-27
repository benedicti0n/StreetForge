"use client";

import { AnyCollider, RigidBody } from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  BufferAttribute,
  BufferGeometry,
  type Mesh,
  type Object3D,
  Vector3,
} from "three";
import type { GeneratedWorldDescriptor } from "@/lib/worldlabs/types";
import {
  createWorldTransform,
  resolveFallbackTransform,
  type ResolvedWorldTransform,
  type WorldTransform,
} from "./worldTransform";
import { findSafeSpawn, type SafeSpawnResult } from "./SafeSpawnResolver";

const _vertex = new Vector3();
const _edgeA = new Vector3();
const _edgeB = new Vector3();
const _gltfLoader = new GLTFLoader();

/**
 * Terrain-aware winding normalization: triangles whose normals point
 * meaningfully downward (inverted ground/ramp surfaces) are flipped so
 * collisions behave correctly regardless of the source GLB's winding.
 */
function normalizeWinding(positions: number[], indices: number[]): void {
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t] * 3;
    const i1 = indices[t + 1] * 3;
    const i2 = indices[t + 2] * 3;
    _edgeA.set(
      positions[i1] - positions[i0],
      positions[i1 + 1] - positions[i0 + 1],
      positions[i1 + 2] - positions[i0 + 2],
    );
    _edgeB.set(
      positions[i2] - positions[i0],
      positions[i2 + 1] - positions[i0 + 1],
      positions[i2 + 2] - positions[i0 + 2],
    );
    _edgeA.cross(_edgeB);
    if (_edgeA.y < -0.35) {
      const swap = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = swap;
    }
  }
}

export interface ColliderBuildResult {
  geometry: BufferGeometry;
  triangleCount: number;
  meshCount: number;
}

export function buildColliderGeometry(
  scene: Object3D,
  transform: WorldTransform,
): ColliderBuildResult {
  const positions: number[] = [];
  const indices: number[] = [];
  let meshCount = 0;
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.geometry) {
      return;
    }
    meshCount += 1;
    const attribute = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    if (!attribute) {
      return;
    }
    const base = positions.length / 3;
    for (let i = 0; i < attribute.count; i++) {
      _vertex.fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld);
      _vertex.multiplyScalar(transform.scale).add(transform.position);
      positions.push(_vertex.x, _vertex.y, _vertex.z);
    }
    if (index) {
      for (let i = 0; i < index.count; i++) {
        indices.push(base + index.getX(i));
      }
    } else {
      for (let i = 0; i < attribute.count; i++) {
        indices.push(base + i);
      }
    }
  });
  const geometry = new BufferGeometry();
  normalizeWinding(positions, indices);
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setIndex(indices);
  return {
    geometry,
    triangleCount: indices.length / 3,
    meshCount,
  };
}

interface WorldColliderProps {
  descriptor: GeneratedWorldDescriptor;
  debug?: boolean;
  onReady?: (spawns: SafeSpawnResult, halfExtent: number) => void;
  onTransformResolved?: (transform: ResolvedWorldTransform) => void;
  onError?: () => void;
}

export function WorldCollider({
  descriptor,
  debug = false,
  onReady,
  onTransformResolved,
  onError,
}: WorldColliderProps) {
  const colliderUrl = descriptor.colliderUrl;
  const initialTransform = useMemo(
    () => createWorldTransform(descriptor),
    [descriptor],
  );
  const [scene, setScene] = useState<Object3D | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!colliderUrl) {
      onError?.();
      return;
    }
    let cancelled = false;
    _gltfLoader.load(
      colliderUrl,
      (gltf) => {
        if (!cancelled) {
          setScene(gltf.scene);
        }
      },
      undefined,
      () => {
        if (!cancelled) {
          setFailed(true);
          onError?.();
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [colliderUrl, onError]);

  // Two-pass build: measure the raw collider in model units first, then
  // resolve the final metric transform (authoritative semantics, or the
  // measured fallback when Marble omits them) and rebuild the geometry so
  // the collider and the splat share the same frame.
  const rawResult = useMemo(() => {
    if (!scene || failed) {
      return null;
    }
    return buildColliderGeometry(scene, {
      position: new Vector3(0, 0, 0),
      quaternion: initialTransform.quaternion,
      scale: 1,
    });
  }, [scene, failed, initialTransform.quaternion]);

  const resolvedTransform = useMemo<ResolvedWorldTransform | null>(() => {
    if (!rawResult) {
      return null;
    }
    rawResult.geometry.computeBoundingBox();
    const box = rawResult.geometry.boundingBox;
    if (!box) {
      return null;
    }
    const rawSize = new Vector3();
    box.getSize(rawSize);
    return resolveFallbackTransform(
      { x: rawSize.x, y: rawSize.y, z: rawSize.z },
      box.min.y,
      descriptor,
    );
  }, [rawResult, descriptor]);

  const transform = useMemo<WorldTransform>(() => {
    if (!resolvedTransform) {
      return initialTransform;
    }
    return {
      position: new Vector3(0, -resolvedTransform.groundOffsetY, 0),
      quaternion: initialTransform.quaternion,
      scale: resolvedTransform.scale,
    };
  }, [resolvedTransform, initialTransform]);

  const result = useMemo(() => {
    if (!scene || failed) {
      return null;
    }
    return buildColliderGeometry(scene, transform);
  }, [scene, transform, failed]);

  const worldInfo = useMemo(() => {
    if (!result) {
      return null;
    }
    result.geometry.computeBoundingBox();
    const box = result.geometry.boundingBox;
    if (!box) {
      return null;
    }
    const halfExtent =
      Math.max(
        Math.abs(box.min.x),
        Math.abs(box.max.x),
        Math.abs(box.min.z),
        Math.abs(box.max.z),
      ) * 1.1;
    const spawns = findSafeSpawn(result.geometry);
    return spawns ? { spawns, halfExtent } : null;
  }, [result]);

  const handleReady = useCallback(() => {
    if (worldInfo && resolvedTransform) {
      onReady?.(worldInfo.spawns, worldInfo.halfExtent);
      onTransformResolved?.(resolvedTransform);
    }
  }, [worldInfo, resolvedTransform, onReady, onTransformResolved]);

  useEffect(() => {
    if (worldInfo) {
      handleReady();
    }
  }, [worldInfo, handleReady]);

  if (!result) {
    return null;
  }
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <AnyCollider
          shape="trimesh"
          args={[
            result.geometry.attributes.position.array,
            result.geometry.getIndex()?.array ?? [],
          ]}
          friction={0.9}
          restitution={0.05}
        />
      </RigidBody>
      {debug && (
        <mesh geometry={result.geometry} renderOrder={10}>
          <meshBasicMaterial
            color="#ff3333"
            wireframe
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}