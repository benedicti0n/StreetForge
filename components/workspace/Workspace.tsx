import { MapEditorPanel } from "@/components/map-editor/MapEditorPanel";
import { WorldViewportPlaceholder } from "@/components/workspace/WorldViewportPlaceholder";

export function Workspace() {
  return (
    <main className="grid h-dvh grid-cols-1 overflow-hidden bg-background md:grid-cols-2">
      <WorldViewportPlaceholder />
      <MapEditorPanel />
    </main>
  );
}