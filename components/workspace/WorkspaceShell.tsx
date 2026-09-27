"use client";

import { useExperience } from "@/components/world/game/ExperienceProvider";
import { MapEditorPanel } from "@/components/map-editor/MapEditorPanel";
import { WorldViewport } from "@/components/world/WorldViewport";

export function WorkspaceShell() {
  const experience = useExperience();
  return (
    <>
      <WorldViewport />
      <MapEditorPanel collapsed={experience.gameplayActive} />
    </>
  );
}