"use client";

import { extend, type ThreeElement } from "@react-three/fiber";
import {
  SparkRenderer as SparkRendererImpl,
  SplatMesh as SplatMeshImpl,
} from "@sparkjsdev/spark";

extend({ SparkRenderer: SparkRendererImpl, SplatMesh: SplatMeshImpl });

declare module "@react-three/fiber" {
  interface ThreeElements {
    sparkRenderer: ThreeElement<typeof SparkRendererImpl>;
    splatMesh: ThreeElement<typeof SplatMeshImpl>;
  }
}

export { SparkRendererImpl, SplatMeshImpl };