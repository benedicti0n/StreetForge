"use client";

import { useState } from "react";

/**
 * Quick pencil-color buttons for the Forge drawing language. Each button is
 * a color box with a label showing what the semantic color represents.
 * Clicking a button copies the semantic color code to the clipboard, so the
 * user can paste it into the editor's color field.
 */

export const FORGE_PENCIL_COLORS = [
  { color: "#000000", label: "Roads" },
  { color: "#e8453c", label: "Buildings" },
  { color: "#4a90d9", label: "Water" },
  { color: "#7ed321", label: "Trees" },
  { color: "#f5a623", label: "Ramps" },
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
    <div className="flex shrink-0 items-center gap-2.5 border-t border-edge/60 bg-panel px-4 py-2">
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
          className={`flex flex-col items-center gap-1 rounded-md px-1.5 py-1 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
            selected === color ? "bg-panel-raised ring-1 ring-accent/50" : ""
          }`}
        >
          <span
            className="block h-4 w-7 rounded-sm border border-zinc-500/70 shadow-sm"
            style={{ backgroundColor: color }}
          />
          <span className="text-[8px] font-medium uppercase tracking-wide text-zinc-400">
            {label}
          </span>
        </button>
      ))}
      <span className="ml-1 text-[9px] text-zinc-400">
        {copied
          ? `${copied} copied: ${
              FORGE_PENCIL_COLORS.find((entry) => entry.label === copied)?.color
            }`
          : ""}
      </span>
    </div>
  );
}