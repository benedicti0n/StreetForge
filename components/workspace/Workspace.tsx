import { MapEditorPanel } from "@/components/map-editor/MapEditorPanel";
import { WorldViewport } from "@/components/world/WorldViewport";
import { WorldPipelineProvider } from "@/components/world/generation/WorldPipeline";
import { ExperienceProvider } from "@/components/world/game/ExperienceProvider";

export function Workspace() {
  return (
    <main className="flex h-dvh overflow-hidden bg-background">
      <WorldPipelineProvider>
        <ExperienceProvider>
          <WorldViewport />
          <MapEditorPanel />
        </ExperienceProvider>
      </WorldPipelineProvider>
    </main>
  );
}