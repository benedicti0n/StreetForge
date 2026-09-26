"use client";

import { useRef } from "react";
import { MapEditor, type MapEditorHandle } from "./MapEditor";

export function MapEditorPanel() {
  const mapEditorRef = useRef<MapEditorHandle>(null);

  return (
    <section
      aria-label="Map image editor"
      className="flex min-h-0 min-w-0 flex-col bg-background"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MapEditor ref={mapEditorRef} />
      </div>
    </section>
  );
}