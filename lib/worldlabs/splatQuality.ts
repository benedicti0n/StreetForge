/**
 * Playable splat quality preference.
 *
 * The 500k tier is the verified gameplay default; the 100k tier is a
 * lightweight fallback for weaker GPUs. The preference is persisted locally
 * and never affects the Marble generation itself (tiers are download-side
 * only).
 */
export type SplatQuality = "high" | "low";

const STORAGE_KEY = "streetforge:splat-quality:v1";

export function readSplatQuality(): SplatQuality {
  if (typeof window === "undefined") {
    return "high";
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "low"
      ? "low"
      : "high";
  } catch {
    return "high";
  }
}

export function writeSplatQuality(quality: SplatQuality): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, quality);
  } catch {
    // ignore storage failures
  }
}