import "server-only";
import type {
  GeneratedWorldDescriptor,
  WorldOperationStatus,
} from "./types";

export const MOCK_ENABLED = process.env.WORLDLABS_MOCK_MODE === "true";

let mockCounter = 0;
const mockPolls = new Map<string, number>();

const MOCK_WORLD: GeneratedWorldDescriptor = {
  worldId: "mock-world-fixture",
  splats: {
    medium: "/test-fixtures/butterfly.spz",
  },
  colliderUrl: "/test-fixtures/collider.glb",
  metricScaleFactor: 1,
  groundPlaneOffset: 0,
  caption: "StreetForge mock fixture world",
};

const MOCK_PROGRESS = [22, 47, 73, 100];

export function isMockOperationId(operationId: string): boolean {
  return operationId.startsWith("mock-op-");
}

export function createMockOperationId(): string {
  mockCounter += 1;
  return `mock-op-${Date.now()}-${mockCounter}`;
}

export function mockOperationStatus(operationId: string): WorldOperationStatus {
  const poll = (mockPolls.get(operationId) ?? 0) + 1;
  mockPolls.set(operationId, poll);
  const progress = MOCK_PROGRESS[Math.min(poll - 1, MOCK_PROGRESS.length - 1)];
  if (poll < 3) {
    return { status: "processing", progress };
  }
  return { status: "completed", progress: 100, world: MOCK_WORLD };
}