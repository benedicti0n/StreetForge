"use client";

import { Quaternion, Vector3 } from "three";
import type { GeneratedWorldDescriptor } from "@/lib/worldlabs/types";

export interface WorldTransform {
  position: Vector3;
  quaternion: Quaternion;
  scale: number;
}

const _upAxis = new Vector3(0, 1, 0);

/**
 * Single source of truth for converting World Labs asset coordinates into
 * the StreetForge scene frame.
 *
 * Marble semantics: metric_xyz = raw_xyz * metric_scale_factor;
 * aligned_xyz = metric_xyz - (0, ground_plane_offset, 0).
 *
 * The splat and the collider share the SAME raw coordinate frame, so both
 * are transformed identically here and no per-asset drift is possible.
 *
 * Yaw orientation is a free choice (both assets rotate together). Modern
 * Marble worlds are already metric, ground-aligned (ground at y=0), so the
 * quaternion stays identity unless a documented correction is needed.
 */
export function createWorldTransform(
  descriptor: GeneratedWorldDescriptor,
): WorldTransform {
  const scale = descriptor.metricScaleFactor ?? 1;
  const groundOffset = descriptor.groundPlaneOffset ?? 0;
  const position = new Vector3(0, -groundOffset, 0);
  const quaternion = new Quaternion().setFromAxisAngle(_upAxis, 0);
  return { position, quaternion, scale };
}

export function selectSplatUrl(
  descriptor: GeneratedWorldDescriptor,
): string | null {
  const { splats } = descriptor;
  return splats.medium ?? splats.full ?? splats.low ?? null;
}