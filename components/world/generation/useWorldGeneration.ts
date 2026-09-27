"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GeneratedWorldDescriptor,
  WorldOperationStatus,
} from "@/lib/worldlabs/types";
import { WORLD_LABS } from "@/lib/worldlabs/client-shared";

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

interface WorldGenerationApi {
  state: WorldGenerationState;
  result: GeneratedWorldDescriptor | null;
  /** Resolves with the generated world descriptor, or null on failure/supersession. */
  start(
    imageDataUrl: string,
    mode: GenerationMode,
  ): Promise<GeneratedWorldDescriptor | null>;
  reset(): void;
}

async function submitGeneration(
  imageDataUrl: string,
  mode: GenerationMode,
): Promise<{ operationId: string }> {
  const response = await fetch("/api/world/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl, mode }),
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
  const [result, setResult] = useState<GeneratedWorldDescriptor | null>(null);

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

  const reset = useCallback(() => {
    generationTokenRef.current += 1;
    abortControllerRef.current?.abort();
    setResult(null);
    setState({ phase: "editing", mode: "draft" });
  }, []);

  return { state, result, start, reset };
}