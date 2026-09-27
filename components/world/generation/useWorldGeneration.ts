"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GeneratedWorldDescriptor,
  WorldOperationStatus,
} from "@/lib/worldlabs/types";
import { WORLD_LABS } from "@/lib/worldlabs/client-shared";
import { parseSketch } from "@/lib/sketchworld/parseSketch";
import {
  buildProceduralWorld,
  buildProceduralWorldFromNormalized,
} from "@/lib/sketchworld/buildWorld";
import { quantizeSemanticMap } from "@/lib/forge-ai/quantizeSemanticMap";
import { parseNormalizedMap } from "@/lib/forge-ai/parseNormalizedMap";
import {
  cacheKey,
  cacheNormalized,
  getCachedNormalized,
} from "@/lib/forge-ai/sessionCache";

export type GenerationPhase =
  | "editing"
  | "capturing"
  | "submitting"
  | "generating"
  | "fetchingWorld"
  | "loadingWorld"
  | "worldReady"
  | "error";

export type GenerationMode = "draft" | "final";

export interface WorldGenerationState {
  phase: GenerationPhase;
  progress?: number;
  error?: string;
  mode: GenerationMode;
}

type WorldResult =
  | GeneratedWorldDescriptor
  | Awaited<ReturnType<typeof buildProceduralWorld>>;

interface WorldGenerationApi {
  state: WorldGenerationState;
  result: WorldResult | null;
  /** Resolves with the generated world descriptor, or null on failure/supersession. */
  start(
    imageDataUrl: string,
    mode: GenerationMode,
  ): Promise<GeneratedWorldDescriptor | null>;
  /** Builds a local procedural world from the sketch - no network calls. */
  startLocal(
    imageDataUrl: string,
  ): Promise<Awaited<ReturnType<typeof buildProceduralWorld>> | null>;
  /**
   * AI-assisted path: normalizes the sketch via OpenAI, quantizes and
   * parses the semantic map, then builds the world. The returned stage
   * tells the caller why the AI path failed (request vs semantic).
   */
  startAi(
    imageDataUrl: string,
  ): Promise<{
    world: Awaited<ReturnType<typeof buildProceduralWorld>> | null;
    stage:
      | "request"
      | "decode"
      | "quantize"
      | "validate"
      | "success";
  }>;
  /** Marks an already-generated world as the active result (refetch path). */
  markWorldReady(world: WorldResult): void;
  reset(): void;
}

async function submitGeneration(
  imageDataUrl: string,
  mode: GenerationMode,
): Promise<{ operationId: string }> {
  const testMode = (
    globalThis as unknown as { __SF_TEST_MODE?: string }
  ).__SF_TEST_MODE;
  const response = await fetch("/api/world/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: imageDataUrl,
      mode: testMode ?? mode,
    }),
    cache: "no-store",
  });
  const body = (await response.json()) as {
    operationId?: string;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || !body.operationId) {
    throw new Error(
      body.error?.message ?? "World generation could not be started.",
    );
  }
  return { operationId: body.operationId };
}

async function pollOperation(
  operationId: string,
  signal: AbortSignal,
): Promise<WorldOperationStatus> {
  const response = await fetch(`/api/world/operation/${operationId}`, {
    signal,
  });
  const body = (await response.json()) as WorldOperationStatus & {
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    throw new Error(body.error?.message ?? "Failed to check generation status.");
  }
  return body;
}

export function useWorldGeneration(): WorldGenerationApi {
  const [state, setState] = useState<WorldGenerationState>({
    phase: "editing",
    mode: "draft",
  });
  const generationTokenRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<WorldResult | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const start = useCallback(
    async (
      imageDataUrl: string,
      mode: GenerationMode,
    ): Promise<GeneratedWorldDescriptor | null> => {
      const token = generationTokenRef.current + 1;
      generationTokenRef.current = token;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setResult(null);

      setState({ phase: "capturing", mode });

      try {
        setState({ phase: "submitting", mode });
        const { operationId } = await submitGeneration(imageDataUrl, mode);
        if (generationTokenRef.current !== token) return null;

        setState({ phase: "generating", progress: 0, mode });
        const startedAt = Date.now();
        for (;;) {
          if (controller.signal.aborted) return null;
          if (Date.now() - startedAt > WORLD_LABS.generationTimeoutMs) {
            throw new Error(
              "Generation is taking longer than expected. You can try again.",
            );
          }
          const status = await pollOperation(operationId, controller.signal);
          if (generationTokenRef.current !== token) return null;

          if (status.status === "processing") {
            setState({
              phase: "generating",
              progress: status.progress,
              mode,
            });
            await new Promise((resolve) =>
              setTimeout(resolve, WORLD_LABS.pollIntervalMs),
            );
            continue;
          }
          if (status.status === "failed") {
            throw new Error(
              status.error ?? "World generation failed on the server.",
            );
          }
          if (status.world) {
            setResult(status.world);
            setState({
              phase: "worldReady",
              progress: 100,
              mode,
            });
            return status.world;
          }
          throw new Error("Generation completed without a world.");
        }
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return null;
        }
        setState({
          phase: "error",
          mode,
          error:
            error instanceof Error
              ? error.message
              : "World generation failed.",
        });
        return null;
      }
    },
    [],
  );

  const markWorldReady = useCallback((world: WorldResult) => {
    generationTokenRef.current += 1;
    abortControllerRef.current?.abort();
    setResult(world);
    setState((prev) => ({
      ...prev,
      phase: "worldReady",
      progress: 100,
    }));
  }, []);

function countOnes(mask: Uint8Array, grid: number): number {
  let n = 0;
  for (let i = 0; i < grid * grid; i++) {
    if (mask[i] === 1) {
      n++;
    }
  }
  return n;
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode the image."));
    image.src = dataUrl;
  });
}

  const startAi = useCallback(
    async (
      imageDataUrl: string,
    ): Promise<{
      world: Awaited<ReturnType<typeof buildProceduralWorld>> | null;
      stage: "request" | "decode" | "quantize" | "validate" | "success";
    }> => {
      const token = generationTokenRef.current + 1;
      generationTokenRef.current = token;
      abortControllerRef.current?.abort();
      setResult(null);
      setState({ phase: "capturing", mode: "draft" });
      const fail = (
        stage: "request" | "decode" | "quantize" | "validate",
      ): { world: null; stage: "request" | "decode" | "quantize" | "validate" } => {
        if (generationTokenRef.current !== token) {
          return { world: null, stage };
        }
        setResult(null);
        setState({ phase: "editing", mode: "draft" });
        return { world: null, stage };
      };
      try {
        const model = "gpt-image-2";
        const key = cacheKey(imageDataUrl, model);
        let normalized = getCachedNormalized(key);
        if (!normalized) {
          setState({ phase: "submitting", mode: "draft" });
          const controller = new AbortController();
          abortControllerRef.current = controller;
          let response: Response;
          try {
            response = await fetch("/api/forge/normalize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: imageDataUrl }),
              cache: "no-store",
              signal: controller.signal,
            });
          } catch {
            return fail("request");
          }
          const body = (await response.json()) as {
            image?: string;
            error?: { code?: string; message?: string };
          };
          if (!response.ok || !body.image) {
            return fail("request");
          }
          normalized = body.image;
          cacheNormalized(key, normalized);
        }
        if (generationTokenRef.current !== token) {
          return { world: null, stage: "request" };
        }

        setState({ phase: "generating", progress: 60, mode: "draft" });
        let image: HTMLImageElement;
        try {
          image = await loadImageElement(normalized);
        } catch {
          return fail("decode");
        }
        let quantized: Awaited<ReturnType<typeof quantizeSemanticMap>>;
        try {
          quantized = await quantizeSemanticMap(image);
        } catch {
          return fail("quantize");
        }
        let layout: Awaited<ReturnType<typeof parseNormalizedMap>>;
        try {
          layout = parseNormalizedMap(quantized.classes, quantized.grid);
        } catch {
          return fail("validate");
        }
        {
          console.info(
            "[streetforge] semantic parse",
            JSON.stringify({
              road: countOnes(layout.roadMask, layout.grid),
              buildings: layout.buildings.length,
              water: countOnes(layout.waterMask, layout.grid),
              vegetation: layout.vegetation.length,
              ramps: layout.ramps.length,
            }),
          );
        }
        const world = await buildProceduralWorldFromNormalized(layout);
        if (generationTokenRef.current !== token) {
          return { world: null, stage: "request" };
        }
        setResult(world);
        setState({ phase: "worldReady", progress: 100, mode: "draft" });
        return { world, stage: "success" };
      } catch {
        return fail("request");
      }
    },
    [],
  );

  const startLocal = useCallback(
    async (
      imageDataUrl: string,
    ): Promise<Awaited<ReturnType<typeof buildProceduralWorld>> | null> => {
      const token = generationTokenRef.current + 1;
      generationTokenRef.current = token;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setResult(null);

      setState({ phase: "capturing", mode: "draft" });
      try {
        // Reading the sketch (the real parse work).
        const parsed = await parseSketch(imageDataUrl);
        if (generationTokenRef.current !== token) return null;

        setState({ phase: "submitting", mode: "draft" });
        // Give the UI a brief, honest "forging" beat while the world is
        // assembled from the parsed layout.
        await new Promise((resolve) => setTimeout(resolve, 420));
        if (generationTokenRef.current !== token) return null;

        setState({ phase: "generating", progress: 85, mode: "draft" });
        const world = await buildProceduralWorld(imageDataUrl, parsed);
        if (generationTokenRef.current !== token) return null;

        setResult(world);
        setState({ phase: "worldReady", progress: 100, mode: "draft" });
        return world;
      } catch {
        if (generationTokenRef.current !== token) return null;
        setState((prev) => ({
          ...prev,
          phase: "error",
          error: "We couldn't forge this world. Your current world is still safe.",
        }));
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    generationTokenRef.current += 1;
    abortControllerRef.current?.abort();
    setResult(null);
    setState({ phase: "editing", mode: "draft" });
  }, []);

  return { state, result, start, startLocal, startAi, markWorldReady, reset };
}