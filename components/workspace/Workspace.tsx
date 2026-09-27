import { WorldPipelineProvider } from "@/components/world/generation/WorldPipeline";
import { ExperienceProvider } from "@/components/world/game/ExperienceProvider";
import { WorkspaceShell } from "./WorkspaceShell";

export function Workspace() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background md:flex-row">
      <WorldPipelineProvider>
        <ExperienceProvider>
          <WorkspaceShell />
        </ExperienceProvider>
      </WorldPipelineProvider>
    </main>
  );
}