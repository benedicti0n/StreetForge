"use client";

import { useCallback, useRef, useState } from "react";
import {
  MapEditor,
  type MapEditorHandle,
  type MapEditorStatus,
} from "./MapEditor";
import {
  MapEditorHeader,
  type MapCaptureFeedback,
} from "./MapEditorHeader";
import { useWorldPipeline } from "@/components/world/generation/WorldPipeline";

interface MapEditorPanelProps {
  /** Visually collapses the panel without unmounting the editor. */
  collapsed?: boolean;
}

export function MapEditorPanel({ collapsed = false }: MapEditorPanelProps) {
  const mapEditorRef = useRef<MapEditorHandle>(null);
  const capturedMapRef = useRef<string | null>(null);
  const [editorStatus, setEditorStatus] =
    useState<MapEditorStatus>("loading");
  const [feedback, setFeedback] = useState<MapCaptureFeedback>(null);
  const pipeline = useWorldPipeline();
  const { generationState } = pipeline;
  const generationActive =
    generationState.phase === "capturing" ||
    generationState.phase === "submitting" ||
    generationState.phase === "generating" ||
    generationState.phase === "fetchingWorld";

  const handleStatusChange = useCallback((status: MapEditorStatus) => {
    setEditorStatus(status);
  }, []);

  const handleBuildWorld = useCallback(async () => {
    const dataUrl = mapEditorRef.current?.getImage();
    if (!dataUrl) {
      setFeedback("error");
      return;
    }
    capturedMapRef.current = dataUrl;
    if (process.env.NODE_ENV === "development") {
      console.info(
        "[streetforge] captured map:",
        dataUrl.length,
        "characters",
      );
    }
    setFeedback("captured");
    if (
      pipeline.worldKind === "forge" &&
      pipeline.forgeMode === "ai" &&
      pipeline.aiEnabled
    ) {
      const world = await pipeline.beginForgeAi(dataUrl);
      if (!world) {
        // AI stage failed: fall back to the local interpretation.
        setFeedback("ai-fallback");
        await pipeline.beginGeneration(dataUrl, pipeline.mode);
        return;
      }
      return;
    }
    await pipeline.beginGeneration(dataUrl, pipeline.mode);
  }, [pipeline]);

  const handleReset = useCallback(() => {
    mapEditorRef.current?.reset();
    capturedMapRef.current = null;
    setFeedback(null);
  }, []);

  return (
    <section
      aria-label="Map image editor"
      aria-hidden={collapsed || undefined}
      inert={collapsed || undefined}
      className={`flex min-h-0 min-w-0 flex-col bg-background transition-[width,height,opacity] duration-300 ease-in-out ${
        collapsed
          ? "pointer-events-none h-0 w-full overflow-hidden opacity-0 md:h-auto md:w-0"
          : "h-auto w-full md:w-1/2"
      }`}
    >
      <MapEditorHeader
        editorReady={editorStatus === "ready"}
        feedback={feedback}
        generation={generationState}
        generationActive={generationActive}
        worldKind={pipeline.worldKind}
        onWorldKindChange={pipeline.setWorldKind}
        onModeChange={pipeline.setMode}
        onReset={handleReset}
        onBuildWorld={handleBuildWorld}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MapEditor ref={mapEditorRef} onStatusChange={handleStatusChange} />
      </div>
    </section>
  );
}