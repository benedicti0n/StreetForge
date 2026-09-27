"use client";

import { AnyCollider, CuboidCollider, RigidBody } from "@react-three/rapier";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { Group, MeshStandardMaterial } from "three";
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
import { semanticPointToWorld } from "@/lib/sketchworld/worldTransform";
import { Shape, ShapeGeometry } from "three";
import type { SafeSpawnResult } from "@/components/world/generated/SafeSpawnResolver";
import {
  cloneVariant,
  computePlacement,
  getVariants,
  logWorldAssetStatus,
  normalizeModel,
  scaleForFootprint,
  scaleForHeight,
  useModelAnimation,
  useWorldAsset,
  WORLD_ASSET_CONFIG,
  WORLD_ASSETS,
  type NormalizedModel,
} from "@/lib/worldAssets";
/** Road asset pieces are laid along the route every this many meters. */
const ROAD_SEGMENT_SPACING = 8;

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
const WATER_SURFACE_MATERIAL = new MeshStandardMaterial({
  color: "#2E7FD8",
  roughness: 0.35,
  metalness: 0.1,
  toneMapped: false,
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
  const waterContourWorld = useMemo(() => {
    const waterMask = descriptor.semantic?.waterMask;
    if (!waterMask || !descriptor.roadTexture) {
      return null;
    }
    const labels = new Int32Array(waterMask.length).fill(-1);
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
    return contour.map(([x, y]) =>
      semanticPointToWorld(x, y, grid, grid, size),
    );
  }, [descriptor.semantic, descriptor.roadTexture, descriptor.worldSize]);

  const waterWallGeometry = useMemo(() => {
    if (!waterContourWorld) {
      return null;
    }
    return buildEdgeWalls(waterContourWorld, 0.9);
  }, [waterContourWorld]);

  const waterSurfaceGeometry = useMemo(() => {
    if (!waterContourWorld || waterContourWorld.length < 3) {
      return null;
    }
    // The contour is in world [x, z] pairs; the shape maps them to its own
    // (x, y) plane, so treat contour z as shape y, then fold it back into
    // world z with the water surface at y = 0.015.
    const shape = new Shape();
    shape.moveTo(waterContourWorld[0][0], waterContourWorld[0][1]);
    for (let i = 1; i < waterContourWorld.length; i++) {
      shape.lineTo(waterContourWorld[i][0], waterContourWorld[i][1]);
    }
    shape.closePath();
    const geometry = new ShapeGeometry(shape);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const z = positions.getY(i);
      positions.setY(i, 0.015);
      positions.setZ(i, z);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }, [waterContourWorld]);

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

  const roadAsset = useWorldAsset(WORLD_ASSETS.road);
  const treeAsset = useWorldAsset(WORLD_ASSETS.trees);
  const buildingAsset = useWorldAsset(WORLD_ASSETS.buildings);
  const waterAsset = useWorldAsset(WORLD_ASSETS.water);
  const rampAsset = useWorldAsset(WORLD_ASSETS.ramp);

  // The real models are split into normalized variants at load time. Each
  // variant's local origin is its horizontal Box3 centre with the base at
  // Y = 0, so semantic placement is a single world transform.
  const treeVariants = useMemo(
    () =>
      treeAsset
        ? getVariants(treeAsset, { excludeNames: /rock/i })
        : [],
    [treeAsset],
  );
  const buildingVariants = useMemo(
    () =>
      buildingAsset ? getVariants(buildingAsset, { minFootprint: 2.5 }) : [],
    [buildingAsset],
  );
  const rampVariants = useMemo(
    () => (rampAsset ? getVariants(rampAsset) : []),
    [rampAsset],
  );
  const waterModel = waterAsset ? normalizeModel(waterAsset) : null;
  const roadModel = roadAsset ? normalizeModel(roadAsset) : null;

  // Road asset pieces placed along the authoritative centerline. The painted
  // base road stays underneath, so the drivable layout never changes.
  const roadPlacements = useMemo(() => {
    if (!roadModel) {
      return null;
    }
    const placement = computePlacement(roadModel, "road");
    const placements: Array<{
      position: [number, number, number];
      yaw: number;
      scale: import("three").Vector3;
    }> = [];
    let travelled = 0;
    let i = 1;
    while (i < descriptor.road.points.length) {
      const [x0, z0] = descriptor.road.points[i - 1];
      const [x1, z1] = descriptor.road.points[i];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const seg = Math.hypot(dx, dz);
      if (seg < 1e-4) {
        i++;
        continue;
      }
      travelled += seg;
      if (travelled >= ROAD_SEGMENT_SPACING) {
        travelled = 0;
        placements.push({
          position: [x1, placement.yOffset, z1],
          yaw: Math.atan2(dx, dz),
          scale: placement.scale,
        });
      }
      i++;
    }
    return placements;
  }, [roadModel, descriptor.road]);

  // Water region fit: the animated GLB is a 100 x 100 m plane, so it is
  // scaled uniformly to sit INSIDE the semantic region (subtle enhancement).
  // The contour-shaped flat surface below stays authoritative.
  const waterTile = useMemo(() => {
    if (!waterModel || !waterContourWorld) {
      return null;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of waterContourWorld) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const width = maxX - minX;
    const depth = maxZ - minZ;
    if (width < 4 || depth < 4) {
      return null;
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const scale =
      Math.min(Math.max(Math.min(width, depth) / 100, 0.05), 1) * 0.85;
    return {
      position: [cx, -waterModel.center.y * scale, cz] as [
        number,
        number,
        number,
      ],
      scale,
      bounds: { x: cx, z: cz, width, depth },
    };
  }, [waterModel, waterContourWorld]);

  // Dev-only asset diagnostics: one summary once every load has settled.
  const assetSettled =
    roadAsset !== undefined &&
    treeAsset !== undefined &&
    buildingAsset !== undefined &&
    waterAsset !== undefined &&
    rampAsset !== undefined;
  useEffect(() => {
    if (!assetSettled) {
      return;
    }
    logWorldAssetStatus([
      { key: "road", value: roadAsset, variants: [] },
      { key: "trees", value: treeAsset, variants: treeVariants },
      { key: "buildings", value: buildingAsset, variants: buildingVariants },
      { key: "water", value: waterAsset, variants: [] },
      { key: "ramp", value: rampAsset, variants: rampVariants },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetSettled]);

  // Dev-only placement diagnostics: region vs spawned counts and the
  // semantic -> world mapping of every logical object. Logged once per world.
  const placementLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    if (placementLoggedRef.current === descriptor.worldId) {
      return;
    }
    placementLoggedRef.current = descriptor.worldId;
    if (process.env.NODE_ENV !== "development") {
      return;
    }
    const sem = descriptor.semantic;
    const lines: string[] = [];
    lines.push("road: CanvasTexture ON, Road Template GLB OFF");
    lines.push(`vegetation regions: ${sem?.vegetationRegions ?? 0}`);
    lines.push(`trees spawned: ${sem?.vegetation.length ?? 0}`);
    lines.push(`building regions: ${sem?.buildingRegions ?? 0}`);
    lines.push(`buildings spawned: ${sem?.buildings.length ?? 0}`);
    lines.push(`ramp regions: ${sem?.rampRegions ?? 0}`);
    lines.push(`ramps spawned: ${sem?.ramps.length ?? 0}`);
    lines.push(`water regions: ${sem?.waterRegionCount ?? 0}`);
    if (waterTile) {
      const b = waterTile.bounds;
      lines.push(
        `water bounds: x=${b.x.toFixed(1)} z=${b.z.toFixed(1)} width=${b.width.toFixed(1)} depth=${b.depth.toFixed(1)}`,
      );
    }
    for (const building of sem?.buildings ?? []) {
      lines.push(
        `building ${building.variant}: semantic(${building.semantic[0]},${building.semantic[1]}) -> world(${building.position[0].toFixed(1)}, ${building.position[2].toFixed(1)})`,
      );
    }
    for (const tree of sem?.vegetation ?? []) {
      lines.push(
        `tree ${tree.variant}: semantic(${tree.semantic[0]},${tree.semantic[1]}) -> world(${tree.position[0].toFixed(1)}, ${tree.position[2].toFixed(1)}) h=${tree.targetHeight.toFixed(1)}m`,
      );
    }
    for (const ramp of sem?.ramps ?? []) {
      lines.push(
        `ramp: semantic(${ramp.semantic[0]},${ramp.semantic[1]}) -> world(${ramp.position[0].toFixed(1)}, ${ramp.position[2].toFixed(1)}) yaw=${ramp.yaw.toFixed(2)}`,
      );
    }
    console.info("[streetforge] Forge placement\n" + lines.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptor, waterTile]);

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
        {/* Walls: low friction + a gentle bounce so cars slide along them
            instead of stalling against the arena boundary. */}
        {walls(descriptor.worldSize).map((wall, index) => (
          <CuboidCollider
            key={`wall-${index}`}
            args={wall.args}
            position={wall.position}
            friction={0.25}
            restitution={0.25}
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
          {/* The ground's material color darkens the texture's exposure so
              the strong scene lights (needed for the tone-mapped props)
              render the palette colors at their designed richness instead
              of clipping them toward white. */}
          <meshStandardMaterial
            map={worldTexture}
            roughness={1}
            toneMapped={false}
            color="#6B6B6B"
          />
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

      {/* Buildings - ONE region -> ONE real GLB building at the region
          centroid; box fallback only while the asset is absent. */}
      {(descriptor.semantic?.buildings ?? []).map((building, index) => {
        const variant =
          buildingVariants.length > 0
            ? buildingVariants[building.variant % buildingVariants.length]
            : null;
        if (!variant) {
          return (
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
          );
        }
        // Fit the normalized building to the semantic footprint, keeping
        // believable proportions (vertical follows the smaller factor).
        const scale = scaleForFootprint(
          variant,
          building.size[0],
          building.size[2],
        );
        // Align the building's long axis to the region's long axis so the
        // footprint aspect reads the same on the ground.
        const regionWide = building.size[0] >= building.size[2];
        const variantWide = variant.size.x >= variant.size.z;
        const yaw = regionWide === variantWide ? 0 : Math.PI / 2;
        return (
          <primitive
            key={`building-mesh-${index}`}
            object={variant.object.clone(true)}
            position={[
              building.position[0],
              0,
              building.position[2],
            ]}
            scale={scale}
            rotation={[0, yaw, 0]}
            castShadow
          />
        );
      })}

      {/* Water - the contour-shaped flat surface is the AUTHORITATIVE visual
          (it follows the semantic region exactly). The animated GLB is only a
          subtle enhancement tile scaled to sit inside the region. */}
      {waterSurfaceGeometry && (
        <mesh
          geometry={waterSurfaceGeometry}
          material={WATER_SURFACE_MATERIAL}
        />
      )}
      {waterModel && waterTile && (
        <WaterModel
          model={waterModel}
          position={waterTile.position}
          scale={waterTile.scale}
        />
      )}

      {/* Ramps - ONE region -> ONE kicker GLB, low side facing the road;
          wedge fallback only while the asset is absent. */}
      {(descriptor.semantic?.ramps ?? []).map((ramp, index) => {
        const variant = rampVariants.length > 0
          ? rampVariants[index % rampVariants.length]
          : null;
        return (
          <group
            key={`ramp-mesh-${index}`}
            position={[ramp.position[0], 0, ramp.position[2]]}
            rotation={[0, ramp.yaw, 0]}
          >
            {variant ? (
              <primitive
                object={variant.object.clone(true)}
                scale={scaleForFootprint(variant, ramp.width, ramp.depth)}
                castShadow
              />
            ) : (
              <>
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
              </>
            )}
          </group>
        );
      })}

      {/* Vegetation - real tree GLB variants sampled INSIDE each vegetation
          region; cone fallback only while the asset is absent. */}
      {(descriptor.semantic?.vegetation ?? []).map((tree, index) => {
        const variant =
          treeVariants.length > 0
            ? treeVariants[tree.variant % treeVariants.length]
            : null;
        const fallback = (
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
              material={index % 3 === 1 ? CANOPY_LIGHT_MATERIAL : CANOPY_MATERIAL}
              position={[0, 2.2, 0]}
              scale={[index % 3 === 2 ? 1.15 : 1, 1, index % 3 === 2 ? 1.15 : 1]}
              castShadow
            />
          </group>
        );
        if (!variant) {
          return fallback;
        }
        // Deterministic height target (3-8 m) + per-tree jitter scale.
        const scale = scaleForHeight(variant, tree.targetHeight) * tree.scale;
        // Deterministic golden-angle yaw - no two trees face the same way.
        const yaw = (tree.variant * 2.399963) % (Math.PI * 2);
        return (
          <primitive
            key={`tree-mesh-${index}`}
            object={variant.object.clone(true)}
            position={[tree.position[0], 0, tree.position[2]]}
            scale={scale}
            rotation={[0, yaw, 0]}
            castShadow
          />
        );
      })}

      {/* Road asset pieces along the generated route (base road stays) */}
      {roadModel &&
        roadPlacements?.map((placement, index) => (
          <primitive
            key={`road-piece-${index}`}
            object={cloneVariant(roadModel.gltf, index)}
            position={placement.position}
            rotation={[0, placement.yaw + (WORLD_ASSET_CONFIG.road.rotationY ?? 0), 0]}
            scale={placement.scale}
            receiveShadow
          />
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
    </group>
  );
}

/** Water region rendered from the Water Animation GLB (animated when clips
 *  exist, static otherwise). No collision - the boundary walls stay. */
function WaterModel({
  model,
  position,
  scale,
}: {
  model: NormalizedModel;
  position: [number, number, number];
  scale: number | import("three").Vector3;
}) {
  const rootRef: RefObject<Group | null> = useRef(null);
  useModelAnimation(model, rootRef);
  return (
    <group ref={rootRef} position={position} scale={scale}>
      <primitive object={model.gltf.scene.clone(true)} />
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