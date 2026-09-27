import { NextResponse } from "next/server";
import {
  fetchWorld,
  WorldLabsApiError,
} from "@/lib/worldlabs/client";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ worldId: string }> },
) {
  const { worldId } = await params;
  if (!worldId) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Missing world id." } },
      { status: 400 },
    );
  }
  try {
    const world = await fetchWorld(worldId);
    return NextResponse.json({ status: "completed", world });
  } catch (error) {
    if (error instanceof WorldLabsApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: "service", message: "Failed to fetch the world." } },
      { status: 500 },
    );
  }
}