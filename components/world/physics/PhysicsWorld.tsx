"use client";

import { CuboidCollider, Physics, RigidBody } from "@react-three/rapier";
import type { ReactNode } from "react";
import { WORLD_HALF_EXTENT } from "../worldConstants";

const GROUND_THICKNESS_HALF = 0.5;

export function PhysicsWorld({ children }: { children: ReactNode }) {
  return (
    <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[
            WORLD_HALF_EXTENT,
            GROUND_THICKNESS_HALF,
            WORLD_HALF_EXTENT,
          ]}
          position={[0, -GROUND_THICKNESS_HALF, 0]}
          friction={0.9}
          restitution={0.05}
        />
      </RigidBody>
      {children}
    </Physics>
  );
}