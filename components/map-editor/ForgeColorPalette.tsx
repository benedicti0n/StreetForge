"use client";

import { useState } from "react";

/**
 * Quick pencil-color buttons for the Forge drawing language. Clicking a
 * button activates the Draw tool and clicks the matching color swatch in
 * the Unlayer panel, so the user's strokes use the semantic color.
 */

export const FORGE_PENCIL_COLORS = [
  { color: "#1c1c1f", label: "Road" },
  { color: "#8a909a", label: "Building" },
  { color: "#2f7fd0", label: "Water" },
  { color: "#3e8e3f", label: "Vegetation" },
  { color: "#e99a28", label: "Ramp" },
] as const;

function hexRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function clickUnlayerSwatch(hex: string): boolean {
  const target = hexRgb(hex);
  const elements = document.querySelectorAll("button, span, div");
  for (const element of elements) {
    const rect = (element as HTMLElement).getBoundingClientRect();
    if (rect.width < 12 || rect.width > 42 || rect.height < 12 || rect.height > 42) {
      continue;
    }
    const match = getComputedStyle(element).backgroundColor.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)/,
    );
    if (!match) {
      continue;
    }
    if (
      Math.abs(Number(match[1]) - target[0]) <= 10 &&
      Math.abs(Number(match[2]) - target[1]) <= 10 &&
      Math.abs(Number(match[3]) - target[2]) <= 10
    ) {
      (element as HTMLElement).click();
      return true;
    }
  }
  return false;
}

function activateDrawTool(): boolean {
  const buttons = document.querySelectorAll("button");
  for (const button of buttons) {
    const text = (button.textContent ?? "").trim();
    const rect = button.getBoundingClientRect();
    if (text === "Draw" && rect.width > 0) {
      button.click();
      return true;
    }
  }
  return false;
}

export function ForgeColorPalette() {
  const [selected, setSelected] = useState<string>(FORGE_PENCIL_COLORS[0].color);

  const handlePick = (color: string) => {
    setSelected(color);
    activateDrawTool();
    window.setTimeout(() => {
      clickUnlayerSwatch(color);
    }, 400);
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
          onClick={() => handlePick(color)}
          aria-label={`Pick the ${label} pencil color`}
          title={label}
          className={`flex h-5 w-5 items-center justify-center rounded-full border transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
            selected === color
              ? "border-accent ring-2 ring-accent/40"
              : "border-zinc-600"
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
      <span className="ml-1 text-[9px] text-zinc-600">
        {FORGE_PENCIL_COLORS.find((entry) => entry.color === selected)?.label}
      </span>
    </div>
  );
}