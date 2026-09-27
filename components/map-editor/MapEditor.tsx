"use client";

import ImageEditor, {
  type ImageEditorOptions,
  type ImageEditorRef,
} from "@unlayer/react-image-editor";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createBlankMapDataUrl } from "@/lib/map/createBlankMap";

export interface MapEditorHandle {
  getImage(): string | null;
  hasChanges(): boolean;
  reset(): void;
}

export type MapEditorStatus = "loading" | "ready" | "error";

interface MapEditorProps {
  onStatusChange?: (status: MapEditorStatus) => void;
}

interface MapEditorFeatures {
  ai?: boolean;
  imageEditor?: {
    dock?: "left" | "right";
    tools?: Partial<
      Record<
        "crop" | "resize" | "filter" | "frame" | "draw" | "text" | "shapes" | "stickers",
        boolean
      >
    >;
  };
}

interface MapEditorOptions extends Omit<ImageEditorOptions, "features"> {
  features?: MapEditorFeatures;
  /** Extended embed options (draw tool palette). */
  tools?: {
    draw?: { colors?: string[] };
  };
}

const MAP_EDITOR_OPTIONS: MapEditorOptions = {
  theme: "dark",
  features: {
    ai: false,
    imageEditor: {
      dock: "left",
      tools: {
        crop: false,
        resize: false,
        filter: false,
        frame: false,
        draw: true,
        text: true,
        shapes: true,
        stickers: true,
      },
    },
  },
  tools: {
    draw: {
      colors: [
        "#1c1c1f",
        "#8a909a",
        "#2f7fd0",
        "#3e8e3f",
        "#e99a28",
        "#b8a272",
        "#303238",
      ],
    },
  },
};

export const MapEditor = forwardRef<MapEditorHandle, MapEditorProps>(
  function MapEditor({ onStatusChange }, ref) {
    const [image, setImage] = useState<string | null>(null);
    const [status, setStatus] = useState<MapEditorStatus>("loading");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [mountKey, setMountKey] = useState(0);
    const editorRef = useRef<ImageEditorRef>(null);

    useEffect(() => {
      setImage(createBlankMapDataUrl());
      setStatus("loading");
    }, []);

    useEffect(() => {
      onStatusChange?.(status);
    }, [status, onStatusChange]);

    const handleLoad = useCallback(() => {
      setStatus("ready");
      setErrorMessage(null);
    }, []);

    const handleError = useCallback((error: Error) => {
      setErrorMessage(error.message || "The map editor failed to initialize.");
      setStatus("error");
    }, []);

    const handleLoadError = useCallback(() => {
      setErrorMessage("The blank map could not be loaded into the editor.");
      setStatus("error");
    }, []);

    const handleRetry = useCallback(() => {
      setStatus("loading");
      setErrorMessage(null);
      setMountKey((key) => key + 1);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        getImage: () => editorRef.current?.editor?.getImage() ?? null,
        hasChanges: () => editorRef.current?.editor?.hasChanges() ?? false,
        reset: () => {
          const instance = editorRef.current?.editor;
          if (!instance) {
            return;
          }
          void instance.reset(createBlankMapDataUrl());
        },
      }),
      [],
    );

    return (
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {image !== null && (
          <ImageEditor
            key={mountKey}
            ref={editorRef}
            image={image}
            options={MAP_EDITOR_OPTIONS}
            minHeight={0}
            style={{ flex: 1, minWidth: 0 }}
            onLoad={handleLoad}
            onError={handleError}
            onLoadError={handleLoadError}
          />
        )}
        {status !== "ready" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            {status === "error" ? (
              <div className="flex max-w-xs flex-col items-center gap-4 text-center">
                <p className="text-sm text-zinc-300">{errorMessage}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="rounded-md border border-edge bg-panel-raised px-4 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div
                  role="status"
                  aria-label="Loading map editor"
                  className="size-8 animate-spin rounded-full border-2 border-edge border-t-accent motion-reduce:animate-none"
                />
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                  Loading Map Editor
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);