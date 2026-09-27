import { MapEditorPanel } from "@/components/map-editor/MapEditorPanel";
import { WorldViewport } from "@/components/world/WorldViewport";
import { WorldPipelineProvider } from "@/components/world/generation/WorldPipeline";

export function Workspace() {
  return (
    <main className="grid h-dvh grid-cols-1 overflow-hidden bg-background md:grid-cols-2">
      <WorldPipelineProvider>
        <WorldViewport />
        <MapEditorPanel />
      </WorldPipelineProvider>
    </main>
  );
}