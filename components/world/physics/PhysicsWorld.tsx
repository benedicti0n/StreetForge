"use client";

import { CuboidCollider, Physics, RigidBody } from "@react-three/rapier";
import type { ReactNode } from "react";
import { WORLD_HALF_EXTENT } from "../worldConstants";

const GROUND_THICKNESS_HALF = 0.5;

interface PhysicsWorldProps {
  children: ReactNode;
  hasGround?: boolean;
}

export function PhysicsWorld({ children, hasGround = true }: PhysicsWorldProps) {
  return (
    <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
      {hasGround && <RigidBody type="fixed" colliders={false}>
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
      </RigidBody>}
      {children}
    </Physics>
  );
}