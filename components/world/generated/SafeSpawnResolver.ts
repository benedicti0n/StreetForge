"use client";

import {
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from "three";

export interface SafeSpawnResult {
  player: { position: [number, number, number] };
  police: { position: [number, number, number] };
}

export interface SpawnCandidate {
  x: number;
  z: number;
}

const _raycaster = new Raycaster();
const _rayOrigin = new Vector3();
const _rayDirection = new Vector3(0, -1, 0);

const SEARCH_PATTERN: SpawnCandidate[] = [
  { x: 0, z: 0 },
  { x: 6, z: 0 },
  { x: -6, z: 0 },
  { x: 0, z: 6 },
  { x: 0, z: -6 },
  { x: 12, z: 0 },
  { x: -12, z: 0 },
  { x: 0, z: 12 },
  { x: 0, z: -12 },
  { x: 12, z: 12 },
  { x: -12, z: 12 },
  { x: 12, z: -12 },
  { x: -12, z: -12 },
  { x: 20, z: 0 },
  { x: -20, z: 0 },
  { x: 0, z: 20 },
  { x: 0, z: -20 },
];

const RAY_START_HEIGHT = 200;
const MIN_NORMAL_Y = 0.65;
const PLAYER_CLEARANCE = 0.8;
const POLICE_CLEARANCE = 0.85;
const POLICE_DISTANCES = [10, 8, 12, 15, 20];
/** Low percentile of flat surfaces treated as the base terrain level. */
const GROUND_PERCENTILE = 0.25;
/** Maximum height above the base terrain for a spawn to be accepted. */
const GROUND_MARGIN = 4;

export function findSafeSpawn(
  geometry: BufferGeometry,
): SafeSpawnResult | null {
  const raycastMesh = new Mesh(geometry, new MeshBasicMaterial());
  raycastMesh.visible = false;

  const hitGround = (x: number, z: number): number | null => {
    _rayOrigin.set(x, RAY_START_HEIGHT, z);
    _raycaster.set(_rayOrigin, _rayDirection);
    _raycaster.far = RAY_START_HEIGHT * 2;
    const hits = _raycaster.intersectObject(raycastMesh, false);
    if (hits.length === 0) {
      return null;
    }
    // Prefer the deepest surface: the base terrain under any elevated
    // structures (ramps, highways) rather than their rooftops.
    const hit = hits[hits.length - 1];
    const normalY = hit.face?.normal.y ?? 0;
    if (normalY < MIN_NORMAL_Y) {
      return null;
    }
    return hit.point.y;
  };

  // Establish the base terrain level from the low percentile of all flat
  // surfaces, so spawns avoid elevated plateaus and highway decks.
  const heights: number[] = [];
  for (const candidate of SEARCH_PATTERN) {
    const y = hitGround(candidate.x, candidate.z);
    if (y !== null) {
      heights.push(y);
    }
  }
  if (heights.length === 0) {
    return null;
  }
  heights.sort((a, b) => a - b);
  const groundLevel =
    heights[Math.max(0, Math.floor(heights.length * GROUND_PERCENTILE) - 1)];

  let playerY: number | null = null;
  let playerX = 0;
  let playerZ = 0;
  for (const candidate of SEARCH_PATTERN) {
    const y = hitGround(candidate.x, candidate.z);
    if (y !== null && y <= groundLevel + GROUND_MARGIN) {
      playerY = y;
      playerX = candidate.x;
      playerZ = candidate.z;
      break;
    }
  }
  if (playerY === null) {
    return null;
  }

  let policeY: number | null = null;
  let policeX = 0;
  let policeZ = 0;
  for (const distance of POLICE_DISTANCES) {
    const candidateX = playerX;
    const candidateZ = playerZ + distance;
    const y = hitGround(candidateX, candidateZ);
    if (y !== null && y <= groundLevel + GROUND_MARGIN + 2) {
      policeY = y;
      policeX = candidateX;
      policeZ = candidateZ;
      break;
    }
  }
  if (policeY === null) {
    return null;
  }

  return {
    player: {
      position: [playerX, playerY + PLAYER_CLEARANCE, playerZ],
    },
    police: {
      position: [policeX, policeY + POLICE_CLEARANCE, policeZ],
    },
  };
}