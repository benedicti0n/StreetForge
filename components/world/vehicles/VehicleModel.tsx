"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import {
  Box3,
  DoubleSide,
  type Material,
  type Mesh,
  type Object3D,
  Vector3,
} from "three";
import type { VehicleDefinition, WheelSlot } from "./vehicleDefinitions";

export interface VehicleWheelInfo {
  slot: WheelSlot;
  node: Object3D;
  /** Geometry-box centre of the wheel subtree in the model's source frame. */
  center: Vector3;
}

interface VehicleModelProps {
  definition: VehicleDefinition;
  onLoad?: () => void;
  /** Called once the model clone is ready and wheel containers are located. */
  onWheelsReady?: (wheels: VehicleWheelInfo[]) => void;
}

const _box = new Box3();
const _center = new Vector3();
const _pos = new Vector3();

function findWheelContainers(
  model: Object3D,
  nodeNames: [string, string, string, string],
): VehicleWheelInfo[] {
  const found: VehicleWheelInfo[] = [];
  for (const name of nodeNames) {
    const node = model.getObjectByName(name);
    if (!node) {
      continue;
    }
    _box.setFromObject(node);
    _center.copy(_box.getCenter(_pos));
    found.push({ slot: "fl", node, center: _center.clone() });
  }
  if (found.length !== 4) {
    return [];
  }
  const byZ = [...found].sort((a, b) => b.center.z - a.center.z);
  const front = byZ.slice(0, 2).sort((a, b) => a.center.x - b.center.x);
  const rear = byZ.slice(2, 4).sort((a, b) => a.center.x - b.center.x);
  front[0].slot = "fl";
  front[1].slot = "fr";
  rear[0].slot = "rl";
  rear[1].slot = "rr";
  return [front[0], front[1], rear[0], rear[1]];
}

export function VehicleModel({
  definition,
  onLoad,
  onWheelsReady,
}: VehicleModelProps) {
  const { scene } = useGLTF(definition.modelPath);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    const materialCache = new Map<string, Material>();
    clone.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const workingMaterials = materials.map((material) => {
        let working = materialCache.get(material.uuid);
        if (!working) {
          working = material.clone();
          working.side = DoubleSide;
          materialCache.set(material.uuid, working);
        }
        return working;
      });
      mesh.material = Array.isArray(mesh.material)
        ? workingMaterials
        : workingMaterials[0];
    });
    return clone;
  }, [scene]);

  useEffect(() => {
    onLoad?.();
  }, [onLoad]);

  useEffect(() => {
    if (!onWheelsReady) {
      return;
    }
    const wheels = findWheelContainers(model, definition.wheelNodeNames);
    if (wheels.length === 4) {
      onWheelsReady(wheels);
    }
  }, [model, definition.wheelNodeNames, onWheelsReady]);

  return (
    <group scale={definition.visualScale}>
      <group position={definition.visualOffset}>
        <primitive object={model} />
      </group>
    </group>
  );
}