"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GeneratedWorldDescriptor } from "@/lib/worldlabs/types";
import { buildProceduralWorld } from "@/lib/sketchworld/buildWorld";
import {
  useWorldGeneration,
  type GenerationMode,
} from "./useWorldGeneration";

export type WorldMode = "sandbox" | "generated";
export type WorldKind = "forge" | "marble";
export type ForgeMode = "ai" | "local";

export type WorldDescriptor =
  | GeneratedWorldDescriptor
  | Awaited<ReturnType<typeof buildProceduralWorld>>;

interface WorldPipelineValue {
  generationState: ReturnType<typeof useWorldGeneration>["state"];
  beginGeneration: (
    imageDataUrl: string,
    mode: GenerationMode,
  ) => Promise<void>;
  /** AI-assisted forge: normalize via OpenAI, then build the world. */
  beginForgeAi: (
    imageDataUrl: string,
  ) => Promise<{ world: WorldDescriptor | null; stage: string }>;
  resetGeneration: () => void;
  /** Refetches fresh metadata for the current world (signed URL recovery). */
  refreshGeneratedWorld: () => Promise<boolean>;
  mode: GenerationMode;
  setMode: (mode: GenerationMode) => void;
  worldKind: WorldKind;
  setWorldKind: (kind: WorldKind) => void;
  forgeMode: ForgeMode;
  setForgeMode: (mode: ForgeMode) => void;
  aiEnabled: boolean;
  generatedWorld: WorldDescriptor | null;
  worldMode: WorldMode;
  setWorldMode: (mode: WorldMode) => void;
}

const WorldPipelineContext = createContext<WorldPipelineValue | null>(null);

export function WorldPipelineProvider({ children }: { children: ReactNode }) {
  const generation = useWorldGeneration();
  const [mode, setMode] = useState<GenerationMode>("draft");
  const [worldKind, setWorldKind] = useState<WorldKind>("forge");
  const [forgeMode, setForgeMode] = useState<ForgeMode>("ai");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [worldMode, setWorldMode] = useState<WorldMode>("sandbox");
  const [generatedWorld, setGeneratedWorld] =
    useState<WorldDescriptor | null>(null);

  const beginForgeAi = useCallback(
    async (imageDataUrl: string) => {
      setWorldKind("forge");
      const result = await generation.startAi(imageDataUrl);
      if (result.world) {
        setGeneratedWorld(result.world);
      }
      return result;
    },
    [generation],
  );

  const beginGeneration = useCallback(
    async (imageDataUrl: string, requestedMode: GenerationMode) => {
      setMode(requestedMode);
      const world =
        worldKind === "forge"
          ? await generation.startLocal(imageDataUrl)
          : await generation.start(imageDataUrl, requestedMode);
      if (world) {
        setGeneratedWorld(world);
      }
    },
    [generation, worldKind],
  );

  // Whether the OpenAI normalize stage is available (server-configured key).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/forge/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { aiEnabled?: boolean }) => {
        if (!cancelled) {
          const enabled = Boolean(body.aiEnabled);
          setAiEnabled(enabled);
          setForgeMode(enabled ? "ai" : "local");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAiEnabled(false);
          setForgeMode("local");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshGeneratedWorld = useCallback(async () => {
    const worldId = generatedWorld?.worldId;
    if (!worldId) {
      return false;
    }
    try {
      const response = await fetch(
        `/api/world/${encodeURIComponent(worldId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as {
        world?: GeneratedWorldDescriptor;
      };
      if (response.ok && body.world) {
        setGeneratedWorld(body.world);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [generatedWorld]);

  useEffect(() => {
    const loadWorldId =
      (
        globalThis as unknown as { __SF_LOAD_WORLD_ID?: string }
      ).__SF_LOAD_WORLD_ID ??
      new URLSearchParams(window.location.search).get("world");
    if (!loadWorldId || loadWorldId === generatedWorld?.worldId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/world/${encodeURIComponent(loadWorldId)}`);
        const body = (await response.json()) as {
          status?: string;
          world?: GeneratedWorldDescriptor;
          error?: { message?: string };
        };
        if (!cancelled && response.ok && body.world) {
          generation.markWorldReady(body.world);
          setGeneratedWorld(body.world);
          setWorldMode("generated");
        }
      } catch {
        // ignore; sandbox remains active
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [generatedWorld?.worldId, generation]);

  const value = useMemo<WorldPipelineValue>(
    () => ({
      generationState: generation.state,
      beginGeneration,
      beginForgeAi,
      resetGeneration: generation.reset,
      refreshGeneratedWorld,
      mode,
      setMode,
      worldKind,
      setWorldKind,
      forgeMode,
      setForgeMode,
      aiEnabled,
      generatedWorld,
      worldMode,
      setWorldMode,
    }),
    [
      generation.state,
      generation.reset,
      beginGeneration,
      beginForgeAi,
      refreshGeneratedWorld,
      mode,
      worldKind,
      forgeMode,
      aiEnabled,
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