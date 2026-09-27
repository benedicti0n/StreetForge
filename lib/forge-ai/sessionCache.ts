/**
 * In-session cache: the exact same source sketch + same normalization
 * settings never triggers a second paid OpenAI call.
 */

const cache = new Map<string, string>();

export function hashSketch(dataUrl: string): string {
  let hash = 5381;
  for (let i = 0; i < dataUrl.length; i++) {
    hash = ((hash << 5) + hash + dataUrl.charCodeAt(i)) >>> 0;
  }
  return `v1-${hash.toString(36)}`;
}

export function getCachedNormalized(hash: string): string | null {
  return cache.get(hash) ?? null;
}

export function cacheNormalized(hash: string, normalized: string): void {
  if (cache.size > 24) {
    cache.clear();
  }
  cache.set(hash, normalized);
}