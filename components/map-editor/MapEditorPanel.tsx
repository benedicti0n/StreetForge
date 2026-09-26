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

export function MapEditorPanel() {
  const mapEditorRef = useRef<MapEditorHandle>(null);
  const capturedMapRef = useRef<string | null>(null);
  const [editorStatus, setEditorStatus] =
    useState<MapEditorStatus>("loading");
  const [feedback, setFeedback] = useState<MapCaptureFeedback>(null);

  const handleStatusChange = useCallback((status: MapEditorStatus) => {
    setEditorStatus(status);
  }, []);

  const handleBuildWorld = useCallback(() => {
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
  }, []);

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
        onReset={handleReset}
        onBuildWorld={handleBuildWorld}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MapEditor ref={mapEditorRef} onStatusChange={handleStatusChange} />
      </div>
    </section>
  );
}