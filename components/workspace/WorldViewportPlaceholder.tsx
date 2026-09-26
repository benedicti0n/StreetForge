export function WorldViewportPlaceholder() {
  return (
    <section
      aria-label="3D world viewport"
      className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-2 border-b border-edge bg-panel md:border-b-0 md:border-r"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
        3D World
      </p>
      <p className="text-[11px] text-zinc-600">Coming in Phase 2</p>
    </section>
  );
}