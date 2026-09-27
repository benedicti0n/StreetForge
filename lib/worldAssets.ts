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
// Variant extraction + normalization.
//
// Every Sketchfab export is a single `Sketchfab_model` root containing the
// whole scene (all trees, all street blocks, ...). Cloning that root scatters
// every object at once - the source of the "props clustered near origin" and
// "giant piles" bugs. Instead we split the scene into leaf groups (Object3D
// nodes whose direct children are all Meshes) and treat each group as ONE
// logical variant (one tree, one building block, one ramp).
//
// Each variant is then normalized ONCE into a wrapper whose local origin is
// the horizontal Box3 centre with the base at Y = 0. Semantic placement then
// controls only the wrapper's world position/rotation/scale - one transform,
// no hidden Sketchfab origin offsets.
// ---------------------------------------------------------------------------

export interface NormalizedVariant {
  /** Flattened clone: identity transforms, geometry centred at X/Z = 0,
      base at Y = 0, unit scale. Safe to place at a world point directly. */
  object: Object3D;
  /** Footprint / height of the normalized variant in model metres. */
  size: Vector3;
  /** Always 0 (base is grounded by normalization). */
  minY: number;
  meshCount: number;
}

export interface VariantOptions {
  /** Drop variants whose largest horizontal dimension is below this. */
  minFootprint?: number;
  /** Drop variants whose name matches (e.g. `/rock/i` for the trees pack). */
  excludeNames?: RegExp;
}

/** True when every direct child of `object` is a mesh (a leaf group). */
function isLeafMeshGroup(object: Object3D): boolean {
  if (object.children.length === 0) {
    return false;
  }
  return object.children.every((child) => (child as Mesh).isMesh);
}

function collectVariantGroups(root: Object3D): Object3D[] {
  const out: Object3D[] = [];
  root.traverse((object) => {
    if (object === root || object.parent === root) {
      return;
    }
    if (isLeafMeshGroup(object)) {
      out.push(object);
    }
  });
  return out;
}

/**
 * Normalizes one leaf group from the ORIGINAL scene: every descendant mesh's
 * full world matrix (all ancestor scales/rotations included) is baked into a
 * fresh clone of its geometry, then the baked geometry is translated so the
 * Box3 centre sits at (0, *, 0) and the base sits at Y = 0.
 *
 * The returned wrapper is a bare Object3D at identity transform whose meshes
 * hold world-space geometry, so semantic placement controls it with a single
 * world position/rotation/scale - no Sketchfab origin or ancestor offsets.
 */
function normalizeVariantGroup(group: Object3D): NormalizedVariant {
  const wrapper = new Group();
  let meshCount = 0;
  group.traverse((object) => {
    if ((object as Mesh).isMesh) {
      const source = object as Mesh;
      const geometry = source.geometry.clone();
      geometry.applyMatrix4(source.matrixWorld);
      wrapper.add(new Mesh(geometry, source.material));
      meshCount++;
    }
  });
  const box = new Box3().setFromObject(wrapper);
  const center = box.getCenter(new Vector3());
  const minY = box.min.y;
  wrapper.traverse((object) => {
    if ((object as Mesh).isMesh) {
      (object as Mesh).geometry.translate(-center.x, -minY, -center.z);
    }
  });
  const size = box.getSize(new Vector3());
  return { object: wrapper, size, minY: 0, meshCount };
}

const variantCache = new Map<string, NormalizedVariant[]>();

/** Collects + normalizes the variants of a loaded asset (cached). */
export function getVariants(
  gltf: GLTF,
  options: VariantOptions = {},
): NormalizedVariant[] {
  const key = `${gltf.scene.uuid}:${options.minFootprint ?? 0}:${
    options.excludeNames?.toString() ?? ""
  }`;
  const cached = variantCache.get(key);
  if (cached) {
    return cached;
  }
  const groups = collectVariantGroups(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  const variants: NormalizedVariant[] = [];
  for (const group of groups) {
    if (options.excludeNames?.test(group.name)) {
      continue;
    }
    const variant = normalizeVariantGroup(group);
    if (options.minFootprint !== undefined) {
      const footprint = Math.max(variant.size.x, variant.size.z);
      if (footprint < options.minFootprint) {
        continue;
      }
    }
    variants.push(variant);
  }
  variantCache.set(key, variants);
  return variants;
}

// ---------------------------------------------------------------------------
// Whole-scene measurements (water keeps its node hierarchy + animation, so it
// is NOT flattened; only its box is measured).
// ---------------------------------------------------------------------------

export interface NormalizedModel {
  gltf: GLTF;
  size: Vector3;
  center: Vector3;
  minY: number;
  meshCount: number;
  animationNames: string[];
}

const modelCache = new Map<string, NormalizedModel>();

export function normalizeModel(gltf: GLTF): NormalizedModel {
  const cached = modelCache.get(gltf.scene.uuid);
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
  modelCache.set(gltf.scene.uuid, result);
  return result;
}

// ---------------------------------------------------------------------------
// Sizing helpers - explicit rules on the NORMALIZED footprint only.
// ---------------------------------------------------------------------------

/**
 * Uniform scale that makes a variant's height match `targetHeight` (metres).
 * Used for trees so every variant lands in the 3-8 m band (capped so the
 * tiny shrub variants never get blown up into absurd blobs).
 */
export function scaleForHeight(
  variant: NormalizedVariant,
  targetHeight: number,
): number {
  const h = Math.max(variant.size.y, 0.01);
  return Math.min(Math.max(targetHeight / h, 0.1), 6);
}

/**
 * Per-axis scale that fits a variant to a semantic footprint without absurd
 * distortion. Vertical scale follows the smaller horizontal factor so
 * proportions stay believable.
 */
export function scaleForFootprint(
  variant: NormalizedVariant,
  width: number,
  depth: number,
): Vector3 {
  const sx = width / Math.max(variant.size.x, 0.001);
  const sz = depth / Math.max(variant.size.z, 0.001);
  const sy = Math.min(sx, sz);
  const clamp = (v: number) => Math.min(Math.max(v, 0.3), 3);
  return new Vector3(clamp(sx), clamp(sy), clamp(sz));
}

// ---------------------------------------------------------------------------
// Animation (water ripples etc.) - plays the first clip of a model.
// ---------------------------------------------------------------------------

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
  assets: Array<{
    key: WorldAssetKey;
    value: GLTF | null | undefined;
    variants: NormalizedVariant[];
  }>,
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  const lines = assets.map(({ key, value, variants }) => {
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
    return `${key}: loaded (${model.meshCount} meshes, variants: ${variants.length}, clips: ${clips}, size: ${size})`;
  });
  console.info("[streetforge] world assets\n" + lines.join("\n"));
}