import { NextResponse } from "next/server";
import OpenAI from "openai";
import { NORMALIZATION_PROMPT } from "@/lib/forge-ai/normalizationPrompt";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 115_000;

export type AiForgeErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH_FAILED"
  | "QUOTA"
  | "RATE_LIMIT"
  | "BAD_REQUEST"
  | "MODEL_ACCESS"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "UNKNOWN";

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

function classifyError(error: unknown): {
  code: AiForgeErrorCode;
  message: string;
} {
  const status =
    typeof (error as { status?: number }).status === "number"
      ? (error as { status: number }).status
      : null;
  const rawCode =
    typeof (error as { code?: string }).code === "string"
      ? (error as { code: string }).code
      : null;
  const name =
    typeof (error as { name?: string }).name === "string"
      ? (error as { name: string }).name
      : null;

  if (name === "AbortError" || status === 408) {
    return { code: "TIMEOUT", message: "AI forge timed out." };
  }
  if (status === 401) {
    return { code: "AUTH_FAILED", message: "OpenAI authentication failed." };
  }
  if (status === 429) {
    return {
      code:
        rawCode === "insufficient_quota" ? "QUOTA" : "RATE_LIMIT",
      message: "OpenAI rate limit or quota exceeded.",
    };
  }
  if (status === 400 || status === 422) {
    return { code: "BAD_REQUEST", message: "OpenAI rejected the request." };
  }
  if (
    rawCode === "model_not_found" ||
    rawCode?.includes("access") ||
    status === 403
  ) {
    return { code: "MODEL_ACCESS", message: "OpenAI model access failed." };
  }
  return { code: "UNKNOWN", message: "OpenAI request failed." };
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "AI forge is not configured." } },
      { status: 503 },
    );
  }

  let body: { image?: string };
  try {
    body = (await request.json()) as { image?: string };
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }
  const decoded = body.image ? decodeDataUrl(body.image) : null;
  if (!decoded) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Expected a square PNG/JPEG/WebP data URL.",
        },
      },
      { status: 400 },
    );
  }
  if (process.env.NODE_ENV === "development") {
    console.info(
      `[forge-ai] input image: mime=${decoded.mime} bytes=${decoded.buffer.length}`,
    );
  }

  const client = new OpenAI({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await client.images.edit(
      {
        model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
        image: new File(
          [decoded.buffer as unknown as BlobPart],
          "sketch.png",
          { type: decoded.mime },
        ),
        prompt: NORMALIZATION_PROMPT,
        size: "1024x1024",
        // NOTE: gpt-image-2 returns b64_json by default; the API rejects
        // the `response_format` parameter with "unknown_parameter".
      },
      { signal: controller.signal, timeout: REQUEST_TIMEOUT_MS },
    );
    const item = response.data?.[0];
    if (!item) {
      return NextResponse.json(
        { error: { code: "INVALID_RESPONSE", message: "AI returned no image." } },
        { status: 502 },
      );
    }
    const b64 = item.b64_json ?? null;
    if (!b64) {
      if (process.env.NODE_ENV === "development") {
        console.info(
          `[forge-ai] response item keys: ${Object.keys(item).join(",")}`,
        );
      }
      return NextResponse.json(
        { error: { code: "INVALID_RESPONSE", message: "AI returned no base64 image." } },
        { status: 502 },
      );
    }
    return NextResponse.json({ image: `data:image/png;base64,${b64}` });
  } catch (error) {
    const classified = classifyError(error);
    if (process.env.NODE_ENV === "development") {
      console.info(
        `[forge-ai] request failed: code=${classified.code} status=${
          (error as { status?: number }).status ?? "n/a"
        } type=${(error as { type?: string }).type ?? "n/a"}`,
      );
    }
    return NextResponse.json(
      { error: classified },
      { status:
          classified.code === "AUTH_FAILED"
            ? 401
            : classified.code === "RATE_LIMIT" || classified.code === "QUOTA"
              ? 429
              : classified.code === "BAD_REQUEST"
                ? 400
                : classified.code === "NOT_CONFIGURED"
                  ? 503
                  : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}