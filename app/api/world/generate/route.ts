import { NextResponse } from "next/server";
import {
  startWorldGeneration,
  WorldLabsApiError,
} from "@/lib/worldlabs/client";
import { WORLD_SKETCH_PROMPT } from "@/lib/worldlabs/prompt";
import type { GenerationMode } from "@/lib/worldlabs/config";
import {
  createMockOperationId,
  MOCK_ENABLED,
} from "@/lib/worldlabs/mock";

export const runtime = "nodejs";

interface GenerateRequest {
  image?: string;
  mode?: string;
}

export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  const image = body.image;
  const mode: GenerationMode = body.mode === "final" ? "final" : "draft";
  if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "A valid map image data URL is required.",
        },
      },
      { status: 400 },
    );
  }

  try {
    if (MOCK_ENABLED) {
      return NextResponse.json({ operationId: createMockOperationId() });
    }
    const result = await startWorldGeneration(image, mode, WORLD_SKETCH_PROMPT);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WorldLabsApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: "service", message: "World generation failed." } },
      { status: 500 },
    );
  }
}