"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GeneratedWorldDescriptor } from "@/lib/worldlabs/types";
import {
  useWorldGeneration,
  type GenerationMode,
} from "./useWorldGeneration";

export type WorldMode = "sandbox" | "generated";

interface WorldPipelineValue {
  generationState: ReturnType<typeof useWorldGeneration>["state"];
  beginGeneration: (
    imageDataUrl: string,
    mode: GenerationMode,
  ) => Promise<void>;
  resetGeneration: () => void;
  mode: GenerationMode;
  setMode: (mode: GenerationMode) => void;
  generatedWorld: GeneratedWorldDescriptor | null;
  worldMode: WorldMode;
  setWorldMode: (mode: WorldMode) => void;
}

const WorldPipelineContext = createContext<WorldPipelineValue | null>(null);

export function WorldPipelineProvider({ children }: { children: ReactNode }) {
  const generation = useWorldGeneration();
  const [mode, setMode] = useState<GenerationMode>("draft");
  const [worldMode, setWorldMode] = useState<WorldMode>("sandbox");
  const [generatedWorld, setGeneratedWorld] =
    useState<GeneratedWorldDescriptor | null>(null);

  const beginGeneration = useCallback(
    async (imageDataUrl: string, requestedMode: GenerationMode) => {
      setMode(requestedMode);
      const world = await generation.start(imageDataUrl, requestedMode);
      if (world) {
        setGeneratedWorld(world);
      }
    },
    [generation],
  );

  const value = useMemo<WorldPipelineValue>(
    () => ({
      generationState: generation.state,
      beginGeneration,
      resetGeneration: generation.reset,
      mode,
      setMode,
      generatedWorld,
      worldMode,
      setWorldMode,
    }),
    [
      generation.state,
      generation.reset,
      beginGeneration,
      mode,
      generatedWorld,
      worldMode,
    ],
  );

  return (
    <WorldPipelineContext.Provider value={value}>
      {children}
    </WorldPipelineContext.Provider>
  );
}

export function useWorldPipeline(): WorldPipelineValue {
  const value = useContext(WorldPipelineContext);
  if (!value) {
    throw new Error(
      "useWorldPipeline must be used inside WorldPipelineProvider",
    );
  }
  return value;
}