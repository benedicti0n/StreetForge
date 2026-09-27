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
import { createWorldTransform, type WorldTransform } from "./worldTransform";

const _vertex = new Vector3();
const _gltfLoader = new GLTFLoader();

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
  onReady?: () => void;
  onError?: () => void;
}

export function WorldCollider({
  descriptor,
  debug = false,
  onReady,
  onError,
}: WorldColliderProps) {
  const colliderUrl = descriptor.colliderUrl;
  const transform = useMemo(() => createWorldTransform(descriptor), [descriptor]);
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

  const result = useMemo(() => {
    if (!scene || failed) {
      return null;
    }
    return buildColliderGeometry(scene, transform);
  }, [scene, transform, failed]);

  const handleReady = useCallback(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    if (result) {
      handleReady();
    }
  }, [result, handleReady]);

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