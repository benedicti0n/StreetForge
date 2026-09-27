"use client";

import { useState } from "react";

/**
 * Quick pencil-color buttons for the Forge drawing language. Clicking a
 * button copies the semantic color code to the clipboard, so the user can
 * paste it into the editor's color field.
 */

export const FORGE_PENCIL_COLORS = [
  { color: "#1c1c1f", label: "Road" },
  { color: "#8a909a", label: "Building" },
  { color: "#2f7fd0", label: "Water" },
  { color: "#3e8e3f", label: "Vegetation" },
  { color: "#e99a28", label: "Ramp" },
] as const;

export function ForgeColorPalette() {
  const [selected, setSelected] = useState<string>(FORGE_PENCIL_COLORS[0].color);
  const [copied, setCopied] = useState<string | null>(null);

  const handlePick = async (color: string, label: string) => {
    setSelected(color);
    try {
      await navigator.clipboard.writeText(color);
    } catch {
      // Clipboard may be unavailable; still show the copied hint.
    }
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1400);
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-edge/60 bg-panel px-4 py-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
        Pencil
      </span>
      {FORGE_PENCIL_COLORS.map(({ color, label }) => (
        <button
          key={color}
          type="button"
          onClick={() => handlePick(color, label)}
          aria-label={`Copy the ${label} color code`}
          title={`Copy ${color} (${label})`}
          className={`flex h-5 w-5 items-center justify-center rounded-full border transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
            selected === color
              ? "border-accent ring-2 ring-accent/40"
              : "border-zinc-600"
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
      <span className="ml-1 text-[9px] text-zinc-400">
        {copied
          ? `${copied} copied: ${
              FORGE_PENCIL_COLORS.find((entry) => entry.label === copied)?.color
            }`
          : FORGE_PENCIL_COLORS.find((entry) => entry.color === selected)?.label}
      </span>
    </div>
  );
}