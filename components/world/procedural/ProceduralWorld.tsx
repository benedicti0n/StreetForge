"use client";

import { AnyCollider, CuboidCollider, RigidBody } from "@react-three/rapier";
import { useCallback, useEffect, useMemo } from "react";
import { MeshStandardMaterial } from "three";
import type { ProceduralWorldDescriptor } from "@/lib/sketchworld/buildWorld";
import {
  buildBox,
  buildRoadRibbon,
  buildTreeGeometry,
  buildWedge,
} from "@/lib/sketchworld/geometry";
import type { SafeSpawnResult } from "@/components/world/generated/SafeSpawnResolver";

const ROAD_RAISE = 0.05;
const WALL_HEIGHT = 3.5;
const WALL_THICKNESS = 1.2;

const TERRAIN_MATERIAL = new MeshStandardMaterial({
  color: "#93bd6f",
  roughness: 1,
});
const ROAD_MATERIAL = new MeshStandardMaterial({
  color: "#48484f",
  roughness: 0.95,
});
const RAMP_MATERIAL = new MeshStandardMaterial({
  color: "#e0a82e",
  roughness: 0.85,
});
const BUILDING_MATERIAL = new MeshStandardMaterial({
  color: "#67707c",
  roughness: 0.9,
});
const WALL_MATERIAL = new MeshStandardMaterial({
  color: "#33343a",
  roughness: 0.9,
});
const TRUNK_MATERIAL = new MeshStandardMaterial({
  color: "#8a5a33",
  roughness: 1,
});
const CANOPY_MATERIAL = new MeshStandardMaterial({
  color: "#3e7c3f",
  roughness: 1,
});

interface ProceduralWorldProps {
  descriptor: ProceduralWorldDescriptor;
  onReady?: (spawns: SafeSpawnResult, halfExtent: number) => void;
}

export function ProceduralWorld({
  descriptor,
  onReady,
}: ProceduralWorldProps) {
  const { road, ramps, buildings, trees } = descriptor;

  const roadGeometry = useMemo(
    () => buildRoadRibbon(road.points, road.width, ROAD_RAISE),
    [road.points, road.width],
  );
  const wedgeGeometry = useMemo(() => buildWedge(9, 11, 2.6), []);
  const treeGeometry = useMemo(() => buildTreeGeometry(), []);

  const wallGeometries = useMemo(
    () =>
      walls(descriptor.worldSize).map((wall) =>
        buildBox(wall.args[0], wall.args[1], wall.args[2]),
      ),
    [descriptor.worldSize],
  );
  const buildingGeometries = useMemo(
    () =>
      buildings.map((building) =>
        buildBox(building.size[0], building.size[1], building.size[2]),
      ),
    [buildings],
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
        {/* Terrain base */}
        <CuboidCollider
          args={[descriptor.worldSize / 2, 0.5, descriptor.worldSize / 2]}
          position={[0, -0.5, 0]}
        />
        {/* Road ribbon */}
        <AnyCollider
          shape="trimesh"
          args={[
            roadGeometry.attributes.position.array,
            roadGeometry.getIndex()?.array ?? [],
          ]}
          friction={1}
          restitution={0.05}
        />
        {/* Ramps */}
        {ramps.map((ramp, index) => (
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
        {buildings.map((building, index) => (
          <CuboidCollider
            key={`building-${index}`}
            args={[
              building.size[0] / 2,
              building.size[1] / 2,
              building.size[2] / 2,
            ]}
            position={building.position}
            rotation={[0, building.yaw, 0]}
            friction={0.8}
          />
        ))}
        {/* Trees */}
        {trees.map((tree, index) => (
          <CuboidCollider
            key={`tree-${index}`}
            args={[0.45 * tree.scale, 1.2 * tree.scale, 0.45 * tree.scale]}
            position={[tree.position[0], 1.2 * tree.scale, tree.position[2]]}
            friction={0.8}
          />
        ))}
      </RigidBody>

      {/* Terrain visual */}
      <mesh material={TERRAIN_MATERIAL} receiveShadow rotation-x={-Math.PI / 2}>
        <planeGeometry args={[descriptor.worldSize, descriptor.worldSize]} />
      </mesh>

      {/* Road visual */}
      <mesh geometry={roadGeometry} material={ROAD_MATERIAL} receiveShadow />

      {/* Ramps */}
      {ramps.map((ramp, index) => (
        <mesh
          key={`ramp-mesh-${index}`}
          geometry={wedgeGeometry}
          material={RAMP_MATERIAL}
          position={ramp.position}
          rotation={[0, ramp.yaw, 0]}
          castShadow
          receiveShadow
        />
      ))}

      {/* Walls */}
      {walls(descriptor.worldSize).map((wall, index) => (
        <mesh
          key={`wall-mesh-${index}`}
          geometry={wallGeometries[index]}
          material={WALL_MATERIAL}
          position={wall.position}
          castShadow
          receiveShadow
        />
      ))}

      {/* Buildings */}
      {buildings.map((building, index) => (
        <mesh
          key={`building-mesh-${index}`}
          geometry={buildingGeometries[index]}
          material={BUILDING_MATERIAL}
          position={[
            building.position[0],
            building.size[1] / 2,
            building.position[2],
          ]}
          rotation={[0, building.yaw, 0]}
          castShadow
          receiveShadow
        />
      ))}

      {/* Trees */}
      {trees.map((tree, index) => (
        <group
          key={`tree-mesh-${index}`}
          position={tree.position}
          scale={tree.scale}
        >
          <mesh
            geometry={treeGeometry.trunk}
            material={TRUNK_MATERIAL}
            castShadow
          />
          <mesh
            geometry={treeGeometry.canopy}
            material={CANOPY_MATERIAL}
            position={[0, 2.2, 0]}
            castShadow
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