"use client";

import { Quaternion, Vector3 } from "three";
import type { GeneratedWorldDescriptor } from "@/lib/worldlabs/types";

export interface WorldTransform {
  position: Vector3;
  quaternion: Quaternion;
  scale: number;
}

export interface ResolvedWorldTransform {
  scale: number;
  groundOffsetY: number;
}

/** Fallback target footprint (meters) when Marble omits metric semantics. */
export const WORLD_FALLBACK_TARGET_SPAN = 160;

const _upAxis = new Vector3(0, 1, 0);

export function createWorldTransform(
  descriptor: GeneratedWorldDescriptor,
): WorldTransform {
  const scale = descriptor.metricScaleFactor ?? 1;
  const groundOffset = descriptor.groundPlaneOffset ?? 0;
  const position = new Vector3(0, -groundOffset, 0);
  const quaternion = new Quaternion().setFromAxisAngle(_upAxis, 0);
  return { position, quaternion, scale };
}

/**
 * Resolves the final metric transform for a world. When Marble provides
 * semantics metadata it is authoritative. Otherwise the scale is derived
 * from the collider footprint and the ground is aligned to the lowest
 * collider point.
 */
export function resolveFallbackTransform(
  rawSize: { x: number; y: number; z: number },
  rawMinY: number,
  descriptor: GeneratedWorldDescriptor,
): ResolvedWorldTransform {
  if (descriptor.metricScaleFactor !== undefined) {
    return {
      scale: descriptor.metricScaleFactor,
      groundOffsetY: descriptor.groundPlaneOffset ?? 0,
    };
  }
  const footprint = Math.max(Math.abs(rawSize.x), Math.abs(rawSize.z));
  const scale = footprint > 0.001 ? WORLD_FALLBACK_TARGET_SPAN / footprint : 1;
  const groundOffsetY = rawMinY * scale;
  return { scale, groundOffsetY };
}

export function selectSplatUrl(
  descriptor: GeneratedWorldDescriptor,
): string | null {
  const { splats } = descriptor;
  return splats.medium ?? splats.full ?? splats.low ?? null;
}