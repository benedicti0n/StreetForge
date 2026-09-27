import "server-only";
import { WORLD_LABS, resolveModel, type GenerationMode } from "./config";
import {
  WorldLabsApiError,
  type GeneratedWorldDescriptor,
  type WorldLabsOperation,
  type WorldLabsWorld,
} from "./types";

export { WorldLabsApiError };

function normalizeError(status: number, body: string): WorldLabsApiError {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { detail?: string | { msg?: string }[] };
    if (typeof parsed.detail === "string") {
      detail = parsed.detail;
    } else if (Array.isArray(parsed.detail)) {
      detail = parsed.detail.map((d) => d.msg ?? "").join("; ");
    }
  } catch {
    detail = body.slice(0, 200);
  }
  switch (status) {
    case 401:
      return new WorldLabsApiError("auth", "Invalid World Labs API key.", 401);
    case 402:
      return new WorldLabsApiError(
        "credits",
        "Insufficient API credits for world generation.",
        402,
      );
    case 429:
      return new WorldLabsApiError(
        "rate_limit",
        "World Labs rate limit reached. Try again shortly.",
        429,
      );
    case 400:
      return new WorldLabsApiError(
        "rejected",
        `World generation request rejected: ${detail || "unknown reason"}`,
        400,
      );
    case 422:
      return new WorldLabsApiError(
        "invalid_request",
        `World generation request is invalid: ${detail || "unknown reason"}`,
        422,
      );
    default:
      return new WorldLabsApiError(
        "service",
        `World Labs service error (${status}).`,
        status,
      );
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const apiKey = process.env.WLT_API_KEY;
  if (!apiKey) {
    throw new WorldLabsApiError(
      "auth",
      "WLT_API_KEY is not configured on the server.",
      500,
    );
  }
  const response = await fetch(`${WORLD_LABS.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "WLT-Api-Key": apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw normalizeError(response.status, await response.text());
  }
  return (await response.json()) as T;
}

function sanitizeWorld(world: WorldLabsWorld): GeneratedWorldDescriptor {
  const spzUrls = world.assets?.splats?.spz_urls ?? {};
  const splats: GeneratedWorldDescriptor["splats"] = {};
  for (const [key, url] of Object.entries(spzUrls)) {
    if (/100k|low/i.test(key)) {
      splats.low = url;
    } else if (/500k|medium/i.test(key)) {
      splats.medium = url;
    } else if (/full/i.test(key)) {
      splats.full = url;
    } else if (!splats.medium) {
      splats.medium = url;
    }
  }
  const semantics = world.assets?.splats?.semantics_metadata;
  return {
    worldId: world.world_id,
    splats,
    colliderUrl: world.assets?.mesh?.collider_mesh_url ?? undefined,
    thumbnailUrl: world.assets?.thumbnail_url ?? undefined,
    metricScaleFactor: semantics?.metric_scale_factor ?? undefined,
    groundPlaneOffset: semantics?.ground_plane_offset ?? undefined,
    caption: world.assets?.caption ?? undefined,
  };
}

export async function startWorldGeneration(
  imageDataUrl: string,
  mode: GenerationMode,
  prompt: string,
): Promise<{ operationId: string }> {
  const dataBase64 = imageDataUrl.split(",")[1];
  if (!dataBase64) {
    throw new WorldLabsApiError(
      "invalid_request",
      "The supplied map image is not a valid data URL.",
      400,
    );
  }
  if (dataBase64.length > 10 * 1024 * 1024) {
    throw new WorldLabsApiError(
      "invalid_request",
      "The map image exceeds the 10MB inline upload limit.",
      400,
    );
  }
  const operation = await apiFetch<WorldLabsOperation>("worlds:generate", {
    method: "POST",
    body: JSON.stringify({
      display_name: "StreetForge World",
      model: resolveModel(mode),
      world_prompt: {
        type: "image",
        image_prompt: {
          data_base64: dataBase64,
          extension: "png",
        },
        text_prompt: prompt,
        is_pano: false,
      },
    }),
  });
  return { operationId: operation.operation_id };
}

export async function fetchOperation(
  operationId: string,
): Promise<WorldLabsOperation> {
  return apiFetch<WorldLabsOperation>(
    `operations/${encodeURIComponent(operationId)}`,
  );
}

export async function fetchWorld(worldId: string): Promise<GeneratedWorldDescriptor> {
  const world = await apiFetch<WorldLabsWorld>(
    `worlds/${encodeURIComponent(worldId)}`,
  );
  return sanitizeWorld(world);
}