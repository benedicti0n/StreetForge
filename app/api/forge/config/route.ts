import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Whether the AI forge stage is available (API key configured server-side). */
export async function GET() {
  return NextResponse.json({
    aiEnabled: Boolean(process.env.OPENAI_API_KEY),
  });
}