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

export function MapEditorPanel() {
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
      className="flex min-h-0 min-w-0 flex-col bg-background"
    >
      <MapEditorHeader
        editorReady={editorStatus === "ready"}
        feedback={feedback}
        generation={generationState}
        generationActive={generationActive}
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