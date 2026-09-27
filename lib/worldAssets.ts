"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AnimationMixer,
  Box3,
  Group,
  Mesh,
  Vector3,
  type Object3D,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

/**
 * World asset registry - the single source of truth for the imported
 * Sketchfab models. Files are NOT bundled with the repo (Sketchfab download
 * requires authentication); when a file is absent the loader resolves to
 * `null` and the procedural fallback stays. As soon as the GLB exists at the
 * registered path, the real model is used and the fallback is bypassed.
 */
export type WorldAssetKey = "road" | "trees" | "buildings" | "water" | "ramp";

export const WORLD_ASSETS: Record<WorldAssetKey, string> = {
  road: "/models/world/road/road.glb",
  trees: "/models/world/trees/trees.glb",
  buildings: "/models/world/buildings/buildings.glb",
  water: "/models/world/water/water.glb",
  ramp: "/models/world/ramp/ramp.glb",
};

export interface WorldAssetConfig {
  /** Extra uniform scale applied on top of any auto-fit (default 1). */
  scale?: number;
  /** Fixed Y rotation (radians) correcting the model's own orientation. */
  rotationY?: number;
  /** Extra vertical lift (meters) after the terrain alignment. */
  yOffset?: number;
  /** Fit the horizontal footprint: width -> x, depth -> z. */
  fit?: { width: number; depth?: number };
  /** Fit the model height to this target (meters) instead of a footprint. */
  targetHeight?: number;
  /** Height cap (meters) when using targetHeight. */
  maxHeight?: number;
}

export const WORLD_ASSET_CONFIG: Record<WorldAssetKey, WorldAssetConfig> = {
  // A straight road segment is tiled along the generated centerline; the
  // painted CanvasTexture road stays underneath as the authoritative surface.
  road: { fit: { width: 8, depth: 8 } },
  // Trees are fitted by height so several variants stay comparable.
  trees: { targetHeight: 5, scale: 0.9, maxHeight: 7 },
  // Buildings are fitted per-footprint at placement time.
  buildings: {},
  // Water is fitted to the generated region bounding box at placement time.
  water: {},
  // Kicker ramps fit the standard ramp footprint (9 x 11 m).
  ramp: { fit: { width: 9, depth: 11 } },
};

// ---------------------------------------------------------------------------
// Loading (cached, single-flight, null on failure - no Suspense, so a missing
// GLB can never break the world build).
// ---------------------------------------------------------------------------

const cache = new Map<string, GLTF | null>();
const inflight = new Map<string, Promise<GLTF | null>>();

async function loadAsset(url: string): Promise<GLTF | null> {
  const cached = cache.get(url);
  if (cached !== undefined) {
    return cached;
  }
  const pending = inflight.get(url);
  if (pending) {
    return pending;
  }
  const promise = (async () => {
    try {
      const head = await fetch(url, { method: "HEAD" });
      if (!head.ok) {
        cache.set(url, null);
        return null;
      }
    } catch {
      cache.set(url, null);
      return null;
    }
    return new Promise<GLTF | null>((resolve) => {
      new GLTFLoader().load(
        url,
        (gltf) => {
          cache.set(url, gltf);
          resolve(gltf);
        },
        undefined,
        () => {
          cache.set(url, null);
          resolve(null);
        },
      );
    });
  })();
  inflight.set(url, promise);
  promise.finally(() => inflight.delete(url));
  return promise;
}

/** Loads a world asset once (cached). `undefined` = loading, `null` = absent. */
export function useWorldAsset(url: string): GLTF | null | undefined {
  const [asset, setAsset] = useState<GLTF | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadAsset(url).then((gltf) => {
      if (alive) {
        setAsset(gltf);
      }
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return asset;
}

// ---------------------------------------------------------------------------
// Normalization: every loaded GLB gets a Box3 measurement and a terrain
// alignment computed once, without editing the original model.
// ---------------------------------------------------------------------------

export interface NormalizedModel {
  gltf: GLTF;
  size: Vector3;
  center: Vector3;
  minY: number;
  meshCount: number;
  animationNames: string[];
}

const normalizedCache = new Map<string, NormalizedModel>();

export function normalizeModel(gltf: GLTF): NormalizedModel {
  const cached = normalizedCache.get(gltf.scene.uuid);
  if (cached) {
    return cached;
  }
  const box = new Box3();
  box.setFromObject(gltf.scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  let meshCount = 0;
  gltf.scene.traverse((object) => {
    if ((object as Mesh).isMesh) {
      meshCount++;
    }
  });
  const result: NormalizedModel = {
    gltf,
    size,
    center,
    minY: box.min.y,
    meshCount,
    animationNames: (gltf.animations ?? []).map((clip) => clip.name),
  };
  normalizedCache.set(gltf.scene.uuid, result);
  return result;
}

export interface PlacementTransform {
  scale: Vector3;
  yOffset: number;
}

/**
 * Computes the placement transform for a model: auto-fit (footprint or
 * height), centralized config (scale/rotation/yOffset) and terrain alignment
 * (the model's minY is lifted to y = 0).
 */
export function computePlacement(
  model: NormalizedModel,
  key: WorldAssetKey,
  fit?: { width: number; depth?: number },
): PlacementTransform {
  const config = WORLD_ASSET_CONFIG[key];
  const base = config.scale ?? 1;
  const fitTarget = fit ?? config.fit;
  let sx = 1;
  let sy = 1;
  let sz = 1;
  const clamp = (v: number) => Math.min(Math.max(v, 0.4), 2.5);
  if (config.targetHeight) {
    const h = (config.targetHeight / Math.max(model.size.y, 0.01)) * base;
    const capped = config.maxHeight
      ? Math.max(h, config.maxHeight / Math.max(model.size.y, 0.01) * base)
      : h;
    sx = sy = sz = clamp(capped);
  } else if (fitTarget) {
    const fx =
      (fitTarget.width ?? model.size.x) / Math.max(model.size.x, 0.001);
    const fz =
      (fitTarget.depth ?? model.size.z) / Math.max(model.size.z, 0.001);
    sx = clamp(fx * base);
    sz = clamp(fz * base);
    sy = clamp(((fx + fz) / 2) * base);
  } else {
    sx = sy = sz = clamp(base);
  }
  const scale = new Vector3(sx, sy, sz);
  const yOffset = -model.minY * sy + (config.yOffset ?? 0);
  return { scale, yOffset };
}

/**
 * Picks a deterministic variant when the GLB exposes several top-level
 * meshes (e.g. several tree types in one file). Falls back to a full-scene
 * clone. The cached GLTF scene is never mutated.
 */
export function cloneVariant(gltf: GLTF, index: number): Object3D {
  const directMeshes = gltf.scene.children.filter((child) =>
    (child as Mesh).isMesh,
  );
  if (directMeshes.length > 1) {
    return directMeshes[index % directMeshes.length].clone();
  }
  return gltf.scene.clone(true);
}

/** Plays the first animation clip of a model (water ripples etc.). */
export function useModelAnimation(
  model: NormalizedModel | null,
  rootRef: React.RefObject<Group | null>,
): void {
  const mixerRef = useRef<AnimationMixer | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!model || model.animationNames.length === 0 || !root) {
      return;
    }
    const mixer = new AnimationMixer(root);
    const action = mixer.clipAction(model.gltf.animations[0]);
    action.play();
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [model, rootRef]);
  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
  });
}

/** Dev-only summary of which world assets loaded and what they contain. */
export function logWorldAssetStatus(
  assets: Array<{ key: WorldAssetKey; value: GLTF | null | undefined }>,
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  const lines = assets.map(({ key, value }) => {
    const path = WORLD_ASSETS[key];
    if (!value) {
      return `${key}: FAILED ${path}`;
    }
    const model = normalizeModel(value);
    const size = model.size
      .toArray()
      .map((n) => n.toFixed(2))
      .join("x");
    const clips =
      model.animationNames.length > 0
        ? model.animationNames.join(",")
        : "none";
    return `${key}: loaded (${model.meshCount} meshes, clips: ${clips}, size: ${size})`;
  });
  console.info("[streetforge] world assets\n" + lines.join("\n"));
}