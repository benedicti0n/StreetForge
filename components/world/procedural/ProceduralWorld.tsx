"use client";

import { AnyCollider, CuboidCollider, RigidBody } from "@react-three/rapier";
import { useCallback, useEffect, useMemo } from "react";
import { MeshStandardMaterial } from "three";
import type { ProceduralWorldDescriptor } from "@/lib/sketchworld/buildWorld";
import {
  buildWorldTexture,
  worldCanvasToTexture,
} from "@/lib/sketchworld/buildWorldTexture";
import {
  buildBox,
  buildEdgeWalls,
  buildTreeGeometry,
  buildWedge,
} from "@/lib/sketchworld/geometry";
import { traceBoundary } from "@/lib/sketchworld/parseSketch";
import type { SafeSpawnResult } from "@/components/world/generated/SafeSpawnResolver";

const WALL_HEIGHT = 3.5;
const WALL_THICKNESS = 1.2;

const TERRAIN_FALLBACK_MATERIAL = new MeshStandardMaterial({
  color: "#93bd6f",
  roughness: 1,
});
const BUILDING_MATERIAL = new MeshStandardMaterial({
  color: "#ADB5BF",
  roughness: 0.9,
});
const BUILDING_ROOF_MATERIAL = new MeshStandardMaterial({
  color: "#6E7680",
  roughness: 0.85,
});
const WEDGE_MATERIAL = new MeshStandardMaterial({
  color: "#2E2E33",
  roughness: 0.9,
});
const WEDGE_EDGE_MATERIAL = new MeshStandardMaterial({
  color: "#FFB03A",
  roughness: 0.6,
});
const TRUNK_MATERIAL = new MeshStandardMaterial({
  color: "#7A4E2A",
  roughness: 1,
});
const CANOPY_MATERIAL = new MeshStandardMaterial({
  color: "#3FA34B",
  roughness: 1,
});
const CANOPY_LIGHT_MATERIAL = new MeshStandardMaterial({
  color: "#5CC05E",
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

  const treeGeometry = useMemo(() => buildTreeGeometry(), []);
  const wedgeGeometry = useMemo(() => buildWedge(9, 11, 2.6), []);
  const buildingGeometries = useMemo(
    () =>
      (descriptor.semantic?.buildings ?? []).map((building) =>
        buildBox(building.size[0], building.size[1], building.size[2]),
      ),
    [descriptor.semantic],
  );
  const roofGeometries = useMemo(
    () =>
      (descriptor.semantic?.buildings ?? []).map((building) =>
        buildBox(building.size[0] + 0.8, 0.6, building.size[2] + 0.8),
      ),
    [descriptor.semantic],
  );
  const waterWallGeometry = useMemo(() => {
    const waterMask = descriptor.semantic?.waterMask;
    if (!waterMask || !descriptor.roadTexture) {
      return null;
    }
    const labels = new Int32Array(waterMask.length).fill(-1);
    // find the largest water component
    let largest = 0;
    for (let i = 0; i < waterMask.length; i++) {
      if (waterMask[i] === 1) {
        labels[i] = 1;
        largest++;
      }
    }
    if (largest < 20) {
      return null;
    }
    const contour = traceBoundary(labels, 1, descriptor.roadTexture.grid);
    if (contour.length < 4) {
      return null;
    }
    const grid = descriptor.roadTexture.grid;
    const size = descriptor.worldSize;
    const world = contour.map(([x, y]) => [
      (x / (grid - 1) - 0.5) * size,
      (y / (grid - 1) - 0.5) * size,
    ] as [number, number]);
    return buildEdgeWalls(world, 0.9);
  }, [descriptor.semantic, descriptor.roadTexture, descriptor.worldSize]);

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
        {/* Buildings */}
        {(descriptor.semantic?.buildings ?? []).map((building, index) => (
          <CuboidCollider
            key={`building-${index}`}
            args={[
              building.size[0] / 2,
              building.size[1] / 2,
              building.size[2] / 2,
            ]}
            position={building.position}
            friction={0.8}
          />
        ))}
        {/* Water boundary walls */}
        {waterWallGeometry && (
          <AnyCollider
            shape="trimesh"
            args={[
              waterWallGeometry.attributes.position.array,
              waterWallGeometry.getIndex()?.array ?? [],
            ]}
            friction={0.6}
          />
        )}
        {/* Ramps */}
        {(descriptor.semantic?.ramps ?? []).map((ramp, index) => (
          <AnyCollider
            key={`ramp-${index}`}
            shape="trimesh"
            args={[
              wedgeGeometry.attributes.position.array,
              wedgeGeometry.getIndex()?.array ?? [],
            ]}
            position={ramp.position}
            rotation={[0, ramp.yaw, 0]}
            friction={0.9}
            restitution={0.05}
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

      {/* Buildings */}
      {(descriptor.semantic?.buildings ?? []).map((building, index) => (
        <group key={`building-mesh-${index}`}>
          <mesh
            geometry={buildingGeometries[index]}
            material={BUILDING_MATERIAL}
            position={[
              building.position[0],
              building.size[1] / 2,
              building.position[2],
            ]}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={roofGeometries[index]}
            material={BUILDING_ROOF_MATERIAL}
            position={[
              building.position[0],
              building.size[1] + 0.3,
              building.position[2],
            ]}
            castShadow
          />
        </group>
      ))}

      {/* Ramps */}
      {(descriptor.semantic?.ramps ?? []).map((ramp, index) => (
        <group
          key={`ramp-mesh-${index}`}
          position={ramp.position}
          rotation={[0, ramp.yaw, 0]}
        >
          <mesh
            geometry={wedgeGeometry}
            material={WEDGE_MATERIAL}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={buildBox(9.2, 0.5, 0.6)}
            material={WEDGE_EDGE_MATERIAL}
            position={[0, 0.25, -5.2]}
            castShadow
          />
        </group>
      ))}

      {/* Vegetation */}
      {(descriptor.semantic?.vegetation ?? []).map((tree, index) => {
        const variant = index % 3;
        return (
          <group
            key={`tree-mesh-${index}`}
            position={tree.position}
            scale={tree.scale}
            rotation={[0, (index * 0.9) % (Math.PI * 2), 0]}
          >
            <mesh
              geometry={treeGeometry.trunk}
              material={TRUNK_MATERIAL}
              castShadow
            />
            <mesh
              geometry={treeGeometry.canopy}
              material={variant === 1 ? CANOPY_LIGHT_MATERIAL : CANOPY_MATERIAL}
              position={[0, 2.2, 0]}
              scale={[variant === 2 ? 1.15 : 1, 1, variant === 2 ? 1.15 : 1]}
              castShadow
            />
          </group>
        );
      })}

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