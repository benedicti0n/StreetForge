export interface WorldLabsOperation {
  operation_id: string;
  done: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
  metadata?: { progress?: number; world_id?: string } | null;
  error?: { message?: string; code?: string } | null;
  response?: WorldLabsWorld | null;
  cost?: unknown;
}

export interface WorldLabsWorld {
  world_id: string;
  display_name?: string | null;
  world_marble_url?: string | null;
  model?: string | null;
  assets?: {
    splats?: {
      spz_urls?: Record<string, string> | null;
      semantics_metadata?: {
        metric_scale_factor?: number | null;
        ground_plane_offset?: number | null;
      } | null;
    } | null;
    mesh?: {
      collider_mesh_url?: string | null;
      full_res_mesh_url?: string | null;
      hq_mesh_url?: string | null;
    } | null;
    thumbnail_url?: string | null;
    caption?: string | null;
  } | null;
}

export interface GeneratedWorldDescriptor {
  worldId: string;
  splats: {
    low?: string;
    medium?: string;
    full?: string;
  };
  colliderUrl?: string;
  thumbnailUrl?: string;
  metricScaleFactor?: number;
  groundPlaneOffset?: number;
  caption?: string;
}

export interface WorldGenerationStart {
  operationId: string;
}

export interface WorldOperationStatus {
  status: "processing" | "completed" | "failed";
  progress?: number;
  world?: GeneratedWorldDescriptor;
  error?: string;
}

export type WorldLabsErrorCode =
  | "auth"
  | "credits"
  | "rate_limit"
  | "invalid_request"
  | "rejected"
  | "service"
  | "timeout"
  | "not_found";

export class WorldLabsApiError extends Error {
  code: WorldLabsErrorCode;
  status: number;

  constructor(code: WorldLabsErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}