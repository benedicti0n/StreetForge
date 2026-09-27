import { NextResponse } from "next/server";
import OpenAI from "openai";
import { NORMALIZATION_PROMPT } from "@/lib/forge-ai/normalizationPrompt";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 55_000;

function decodeDataUrl(dataUrl: string): {
  mime: string;
  buffer: Buffer;
} | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl,
  );
  if (!match) {
    return null;
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return null;
  }
  return { mime: match[1], buffer };
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: "unavailable", message: "AI forge is not configured." } },
      { status: 503 },
    );
  }

  let body: { image?: string };
  try {
    body = (await request.json()) as { image?: string };
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }
  const decoded = body.image ? decodeDataUrl(body.image) : null;
  if (!decoded) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "Expected a square PNG/JPEG/WebP data URL.",
        },
      },
      { status: 400 },
    );
  }

  const client = new OpenAI({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await client.images.edit(
      {
        model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
        image: new File([decoded.buffer], "sketch.png", {
          type: decoded.mime,
        }),
        prompt: NORMALIZATION_PROMPT,
        size: "1024x1024",
        response_format: "b64_json",
      },
      { signal: controller.signal, timeout: REQUEST_TIMEOUT_MS },
    );
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { error: { code: "service", message: "AI returned no image." } },
        { status: 502 },
      );
    }
    return NextResponse.json({ image: `data:image/png;base64,${b64}` });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "AI forge timed out."
        : "AI normalization failed.";
    return NextResponse.json(
      { error: { code: "service", message } },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}