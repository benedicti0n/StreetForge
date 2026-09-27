"use client";

import { AnyCollider, CuboidCollider, RigidBody } from "@react-three/rapier";
import { useCallback, useEffect, useMemo } from "react";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import type { ProceduralWorldDescriptor } from "@/lib/sketchworld/buildWorld";
import {
  buildBox,
  buildDashPlacements,
  buildRoadRibbonWithShoulder,
  buildTreeGeometry,
  buildWedge,
} from "@/lib/sketchworld/geometry";
import type { SafeSpawnResult } from "@/components/world/generated/SafeSpawnResolver";

const ROAD_RAISE = 0.07;
const WALL_HEIGHT = 3.5;
const WALL_THICKNESS = 1.2;

const TERRAIN_MATERIAL = new MeshStandardMaterial({
  color: "#93bd6f",
  roughness: 1,
});


const DASH_MATERIAL = new MeshStandardMaterial({
  color: "#f2e3a1",
  roughness: 0.9,
});
const RAMP_MATERIAL = new MeshStandardMaterial({
  color: "#e0a82e",
  roughness: 0.85,
});
const RAMP_SUPPORT_MATERIAL = new MeshStandardMaterial({
  color: "#3a3833",
  roughness: 0.95,
});
const BUILDING_MATERIAL = new MeshStandardMaterial({
  color: "#67707c",
  roughness: 0.9,
});
const BUILDING_ROOF_MATERIAL = new MeshStandardMaterial({
  color: "#7d8794",
  roughness: 0.85,
});
const WALL_MATERIAL = new MeshStandardMaterial({
  color: "#41424a",
  roughness: 0.9,
});
const WALL_CAP_MATERIAL = new MeshStandardMaterial({
  color: "#8a8f9c",
  roughness: 0.85,
});
const TRUNK_MATERIAL = new MeshStandardMaterial({
  color: "#8a5a33",
  roughness: 1,
});
const CANOPY_MATERIAL = new MeshStandardMaterial({
  color: "#3e7c3f",
  roughness: 1,
});
const CANOPY_LIGHT_MATERIAL = new MeshStandardMaterial({
  color: "#55a056",
  roughness: 1,
});

const _matrix = new Object3D();

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
    () =>
      buildRoadRibbonWithShoulder(
        road.points,
        road.width,
        road.width + 2.2,
        ROAD_RAISE,
        [0.28, 0.28, 0.31],
        [0.69, 0.65, 0.55],
      ),
    [road.points, road.width],
  );
  const wedgeGeometry = useMemo(() => buildWedge(9, 11, 2.6), []);
  const treeGeometry = useMemo(() => buildTreeGeometry(), []);

  const dashPlacements = useMemo(
    () => buildDashPlacements(road.points, 6, 3.4, ROAD_RAISE + 0.014),
    [road.points],
  );
  const dashGeometry = useMemo(() => buildBox(0.32, 0.02, 2.6), []);
  const dashInstances = useMemo(() => {
    if (dashPlacements.length === 0) {
      return null;
    }
    const mesh = new InstancedMesh(
      dashGeometry,
      DASH_MATERIAL,
      dashPlacements.length,
    );
    dashPlacements.forEach((dash, index) => {
      _matrix.position.set(
        dash.position[0],
        dash.position[1],
        dash.position[2],
      );
      _matrix.rotation.set(0, dash.yaw, 0);
      _matrix.scale.setScalar(1);
      _matrix.updateMatrix();
      mesh.setMatrixAt(index, _matrix.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [dashPlacements, dashGeometry]);

  // Deterministic tree variants by index: taller/smaller canopies and
  // slightly different canopy colours, plus a per-tree rotation.
  const treeVariants = useMemo(
    () =>
      trees.map((_, index) => ({
        canopyScale: index % 3 === 0 ? 1.15 : index % 3 === 1 ? 0.85 : 1,
        useLightCanopy: index % 4 === 2,
        yaw: (index * 0.9) % (Math.PI * 2),
      })),
    [trees],
  );

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
  const buildingGeometries = useMemo(
    () =>
      buildings.map((building) =>
        buildBox(building.size[0], building.size[1], building.size[2]),
      ),
    [buildings],
  );
  const roofGeometries = useMemo(
    () =>
      buildings.map((building) =>
        buildBox(building.size[0] + 0.8, 0.6, building.size[2] + 0.8),
      ),
    [buildings],
  );

  // Low-frequency terrain tint variation via deterministic vertex colors.
  const terrainGeometry = useMemo(() => {
    const size = descriptor.worldSize;
    const segments = 22;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    for (let y = 0; y <= segments; y++) {
      for (let x = 0; x <= segments; x++) {
        const u = x / segments;
        const v = y / segments;
        positions.push((u - 0.5) * size, 0, (v - 0.5) * size);
        const variation =
          0.92 +
          0.08 *
            (0.5 +
              0.5 *
                Math.sin(u * 9.2 + 1.7) *
                Math.cos(v * 7.1 + 0.4) *
                Math.sin((u + v) * 4.3));
        const color = new Color("#93bd6f").multiplyScalar(variation);
        colors.push(color.r, color.g, color.b);
      }
    }
    for (let y = 0; y < segments; y++) {
      for (let x = 0; x < segments; x++) {
        const a = y * (segments + 1) + x;
        const b = a + 1;
        const c = a + segments + 1;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [descriptor.worldSize]);

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
      <mesh geometry={terrainGeometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>

      {/* Center dashes */}
      {dashInstances && <primitive object={dashInstances} />}

      {/* Ramps */}
      {ramps.map((ramp, index) => (
        <group key={`ramp-${index}`} position={ramp.position} rotation={[0, ramp.yaw, 0]}>
          <mesh
            geometry={wedgeGeometry}
            material={RAMP_MATERIAL}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={buildBox(9.6, 0.35, 5)}
            material={RAMP_SUPPORT_MATERIAL}
            position={[0, -0.17, 4]}
            receiveShadow
          />
        </group>
      ))}

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

      {/* Buildings + roofs */}
      {buildings.map((building, index) => (
        <group key={`building-mesh-${index}`} rotation={[0, building.yaw, 0]}>
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

      {/* Trees */}
      {trees.map((tree, index) => {
        const variant = treeVariants[index];
        return (
          <group
            key={`tree-mesh-${index}`}
            position={tree.position}
            scale={tree.scale}
            rotation={[0, variant.yaw, 0]}
          >
            <mesh
              geometry={treeGeometry.trunk}
              material={TRUNK_MATERIAL}
              castShadow
            />
            <mesh
              geometry={treeGeometry.canopy}
              material={variant.useLightCanopy ? CANOPY_LIGHT_MATERIAL : CANOPY_MATERIAL}
              position={[0, 2.2, 0]}
              scale={[variant.canopyScale, variant.canopyScale * 0.9, variant.canopyScale]}
              castShadow
            />
          </group>
        );
      })}
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