"use client";

import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useCallback, useEffect, useMemo } from "react";
import { MeshStandardMaterial } from "three";
import type { ProceduralWorldDescriptor } from "@/lib/sketchworld/buildWorld";
import {
  buildWorldTexture,
  worldCanvasToTexture,
} from "@/lib/sketchworld/buildWorldTexture";
import { buildBox } from "@/lib/sketchworld/geometry";
import type { SafeSpawnResult } from "@/components/world/generated/SafeSpawnResolver";

const WALL_HEIGHT = 3.5;
const WALL_THICKNESS = 1.2;

const TERRAIN_FALLBACK_MATERIAL = new MeshStandardMaterial({
  color: "#93bd6f",
  roughness: 1,
});
const WALL_MATERIAL = new MeshStandardMaterial({
  color: "#41424a",
  roughness: 0.9,
});
const WALL_CAP_MATERIAL = new MeshStandardMaterial({
  color: "#8a8f9c",
  roughness: 0.85,
});

interface ProceduralWorldProps {
  descriptor: ProceduralWorldDescriptor;
  onReady?: (spawns: SafeSpawnResult, halfExtent: number) => void;
}

export function ProceduralWorld({
  descriptor,
  onReady,
}: ProceduralWorldProps) {
  const worldTexture = useMemo(() => {
    if (!descriptor.roadTexture) {
      return null;
    }
    const { canvas } = buildWorldTexture(descriptor.roadTexture);
    return worldCanvasToTexture(canvas);
  }, [descriptor.roadTexture]);

  const wallGeometries = useMemo(
    () =>
      walls(descriptor.worldSize).map((wall) =>
        buildBox(wall.args[0], wall.args[1], wall.args[2]),
      ),
    [descriptor.worldSize],
  );
  const capGeometries = useMemo(
    () =>
      walls(descriptor.worldSize).map((wall) =>
        buildBox(wall.args[0] + 0.4, 0.5, wall.args[2] + 0.4),
      ),
    [descriptor.worldSize],
  );

  const handleReady = useCallback(() => {
    onReady?.(
      {
        player: descriptor.spawns.player,
        police: descriptor.spawns.police,
      },
      descriptor.halfExtent,
    );
  }, [onReady, descriptor]);

  useEffect(() => {
    handleReady();
  }, [handleReady]);

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {/* One flat ground collider, top at y = 0. No road trimesh: the
            road is a visual route on the texture, not physical geometry. */}
        <CuboidCollider
          args={[descriptor.worldSize / 2, 0.5, descriptor.worldSize / 2]}
          position={[0, -0.5, 0]}
          friction={1}
        />
        {/* Walls */}
        {walls(descriptor.worldSize).map((wall, index) => (
          <CuboidCollider
            key={`wall-${index}`}
            args={wall.args}
            position={wall.position}
            friction={0.8}
          />
        ))}
      </RigidBody>

      {/* Single visual terrain plane, textured from the parsed road mask. */}
      {worldTexture ? (
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[descriptor.worldSize, descriptor.worldSize]} />
          <meshStandardMaterial map={worldTexture} roughness={1} />
        </mesh>
      ) : (
        <mesh
          rotation-x={-Math.PI / 2}
          material={TERRAIN_FALLBACK_MATERIAL}
          receiveShadow
        >
          <planeGeometry args={[descriptor.worldSize, descriptor.worldSize]} />
        </mesh>
      )}

      {/* Walls + caps */}
      {walls(descriptor.worldSize).map((wall, index) => (
        <group key={`wall-${index}`}>
          <mesh
            geometry={wallGeometries[index]}
            material={WALL_MATERIAL}
            position={wall.position}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={capGeometries[index]}
            material={WALL_CAP_MATERIAL}
            position={[
              wall.position[0],
              wall.position[1] + wall.args[1] / 2 + 0.25,
              wall.position[2],
            ]}
          />
        </group>
      ))}
    </group>
  );
}

function walls(worldSize: number): Array<{
  position: [number, number, number];
  args: [number, number, number];
}> {
  const half = worldSize / 2;
  return [
    {
      position: [0, WALL_HEIGHT / 2, -half - WALL_THICKNESS / 2],
      args: [worldSize + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS],
    },
    {
      position: [0, WALL_HEIGHT / 2, half + WALL_THICKNESS / 2],
      args: [worldSize + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS],
    },
    {
      position: [-half - WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0],
      args: [WALL_THICKNESS, WALL_HEIGHT, worldSize],
    },
    {
      position: [half + WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0],
      args: [WALL_THICKNESS, WALL_HEIGHT, worldSize],
    },
  ];
}