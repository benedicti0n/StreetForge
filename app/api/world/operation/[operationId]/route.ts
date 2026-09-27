import { NextResponse } from "next/server";
import {
  fetchOperation,
  fetchWorld,
  WorldLabsApiError,
} from "@/lib/worldlabs/client";
import { WORLD_LABS } from "@/lib/worldlabs/config";
import {
  isMockOperationId,
  mockOperationStatus,
} from "@/lib/worldlabs/mock";
import type { WorldOperationStatus } from "@/lib/worldlabs/types";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ operationId: string }> },
) {
  const { operationId } = await params;
  if (!operationId) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Missing operation id." } },
      { status: 400 },
    );
  }

  try {
    if (isMockOperationId(operationId)) {
      return NextResponse.json(mockOperationStatus(operationId));
    }
    const operation = await fetchOperation(operationId);

    if (operation.error) {
      const status: WorldOperationStatus = {
        status: "failed",
        error:
          operation.error.message ?? "World generation failed on the server.",
      };
      return NextResponse.json(status);
    }

    if (!operation.done) {
      const status: WorldOperationStatus = {
        status: "processing",
        progress: operation.metadata?.progress,
      };
      return NextResponse.json(status);
    }

    const worldId = operation.response?.world_id;
    if (!worldId) {
      const status: WorldOperationStatus = {
        status: "failed",
        error: "Generation completed without a world id.",
      };
      return NextResponse.json(status);
    }

    const world = await fetchWorld(worldId);
    const status: WorldOperationStatus = {
      status: "completed",
      world,
      progress: 100,
    };
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof WorldLabsApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "service",
          message: "Failed to check world generation status.",
        },
      },
      { status: 500 },
    );
  }
}

export const generationTimeoutMs = WORLD_LABS.generationTimeoutMs;