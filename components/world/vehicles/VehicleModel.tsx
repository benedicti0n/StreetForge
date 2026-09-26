"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { DoubleSide, type Material, type Mesh } from "three";
import type { VehicleDefinition } from "./vehicleDefinitions";

interface VehicleModelProps {
  definition: VehicleDefinition;
  onLoad?: () => void;
}

export function VehicleModel({ definition, onLoad }: VehicleModelProps) {
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

  return (
    <group scale={definition.visualScale}>
      <group position={definition.visualOffset}>
        <primitive object={model} />
      </group>
    </group>
  );
}