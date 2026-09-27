import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Safe AI forge status: whether the server sees the OpenAI key + model. */
export async function GET() {
  const configured = Boolean(process.env.OPENAI_API_KEY);
  if (process.env.NODE_ENV === "development") {
    console.info(
      `[forge-ai] OpenAI key configured: ${configured}, model: ${
        process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2"
      }`,
    );
  }
  return NextResponse.json({
    configured,
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
  });
}