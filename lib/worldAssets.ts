"use client";

import { useEffect, useState } from "react";
import { Box3, Vector3, type Object3D } from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import worldAssetManifest from "../public/models/world/manifest.json";

/**
 * World asset registry.
 *
 * The Sketchfab downloads for these models require authentication and could
 * not be fetched automatically. When models are placed under
 * public/models/world/ (see ASSETS.md), flip "enabled" to true in
 * public/models/world/manifest.json. While disabled, no model requests are
 * made at all and the world keeps its built-in procedural visuals.
 */
export const WORLD_ASSETS = {
  roads: "/models/world/roads/road.glb",
  trees: "/models/world/trees/trees.glb",
  buildings: "/models/world/buildings/buildings.glb",
  water: "/models/world/water/water.glb",
  ramps: "/models/world/ramps/ramp.glb",
} as const;

export const WORLD_ASSETS_ENABLED = worldAssetManifest.enabled === true;

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
      // HEAD-check first so an absent asset resolves to `null` without
      // spamming the console with 404/loader errors.
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

/** Loads a world asset once (cached), resolving to `null` when absent. */
export function useWorldAsset(url: string): GLTF | null | undefined {
  const [asset, setAsset] = useState<GLTF | null | undefined>(
    WORLD_ASSETS_ENABLED ? undefined : null,
  );
  useEffect(() => {
    if (!WORLD_ASSETS_ENABLED) {
      return;
    }
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

/** Bounding box of a loaded model scene, in its local units. */
export function modelBounds(gltf: GLTF): Box3 {
  const box = new Box3();
  box.setFromObject(gltf.scene);
  return box;
}

/**
 * Scale a model to fit the requested footprint. Each axis is fitted to its
 * own target (targetWidth -> x, targetDepth -> z), with the height scaled by
 * the average of the two horizontal factors. `maxScale` caps distortion so a
 * small footprint never stretches a model absurdly.
 */
export function fitModelScale(
  gltf: GLTF,
  targetWidth: number,
  targetDepth: number,
  maxScale = 2.5,
): Vector3 {
  const box = modelBounds(gltf);
  const size = box.getSize(new Vector3());
  const sx = targetWidth / Math.max(size.x, 0.001);
  const sz = targetDepth / Math.max(size.z, 0.001);
  const clampedX = Math.min(Math.max(sx, 1 / maxScale), maxScale);
  const clampedZ = Math.min(Math.max(sz, 1 / maxScale), maxScale);
  const sy = (clampedX + clampedZ) / 2;
  return new Vector3(clampedX, sy, clampedZ);
}

/** Straight-line length of a road model in its local units. */
export function modelLength(gltf: GLTF): number {
  const size = modelBounds(gltf).getSize(new Vector3());
  return Math.max(size.z, size.x);
}

/** Deep-clones a model scene for placement (shared materials are kept). */
export function cloneModel(gltf: GLTF): Object3D {
  return gltf.scene.clone(true);
}