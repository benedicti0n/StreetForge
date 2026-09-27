import "server-only";

export const WORLD_LABS = {
  apiBaseUrl:
    process.env.WORLDLABS_API_BASE_URL ?? "https://api.worldlabs.ai/marble/v1",
  draftModel: process.env.WORLDLABS_DRAFT_MODEL ?? "marble-1.0-draft",
  finalModel: process.env.WORLDLABS_FINAL_MODEL ?? "marble-1.1",
  pollIntervalMs: 5000,
  generationTimeoutMs: 10 * 60 * 1000,
} as const;

export type GenerationMode = "draft" | "final";

export function resolveModel(mode: GenerationMode): string {
  return mode === "draft" ? WORLD_LABS.draftModel : WORLD_LABS.finalModel;
}