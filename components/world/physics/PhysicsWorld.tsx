"use client";

import { CuboidCollider, Physics, RigidBody } from "@react-three/rapier";
import type { ReactNode } from "react";

export const WORLD_GROUND_HALF_EXTENT = 50;

export function PhysicsWorld({ children }: { children: ReactNode }) {
  return (
    <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[WORLD_GROUND_HALF_EXTENT, 0.5, WORLD_GROUND_HALF_EXTENT]}
          position={[0, -0.5, 0]}
          friction={0.9}
          restitution={0.05}
        />
      </RigidBody>
      {children}
    </Physics>
  );
}