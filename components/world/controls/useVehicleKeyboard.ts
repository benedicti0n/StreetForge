"use client";

import { useEffect, useRef } from "react";
import type { VehicleControlRef } from "@/components/world/vehicles/vehicleTypes";

const DRIVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);

function isEditableTarget(): boolean {
  const element = document.activeElement;
  if (!element) {
    return false;
  }
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

export function useVehicleKeyboard(
  controlsRef: VehicleControlRef,
  enabled: boolean,
  onResetRequested: () => void,
  onExitRequested: () => void,
): void {
  // The callbacks are intentionally kept in refs so their identity changes
  // (e.g. the experience context re-creating the exit handler every frame
  // while escape/bust progress updates) can never tear down and re-subscribe
  // the key listeners. Re-subscribing would clear the held-key set and zero
  // the controls mid-pursuit. The effect below only depends on the stable
  // `enabled` flag and the stable controls ref.
  const onResetRef = useRef(onResetRequested);
  const onExitRef = useRef(onExitRequested);
  useEffect(() => {
    onResetRef.current = onResetRequested;
    onExitRef.current = onExitRequested;
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const keys = new Set<string>();

    const apply = () => {
      if (isEditableTarget()) {
        Object.assign(controlsRef.current, {
          throttle: 0,
          brake: 0,
          steering: 0,
          handbrake: 0,
        });
        return;
      }
      const up = keys.has("KeyW") || keys.has("ArrowUp");
      const down = keys.has("KeyS") || keys.has("ArrowDown");
      const left = keys.has("KeyA") || keys.has("ArrowLeft");
      const right = keys.has("KeyD") || keys.has("ArrowRight");
      controlsRef.current.throttle = (up ? 1 : 0) - (down ? 1 : 0);
      // Canonical steering convention (shared with the police chase):
      // steering > 0 = LEFT, steering < 0 = RIGHT.
      controlsRef.current.steering = (left ? 1 : 0) - (right ? 1 : 0);
      controlsRef.current.handbrake = keys.has("Space") ? 1 : 0;
      controlsRef.current.brake = 0;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget()) {
        return;
      }
      if (DRIVE_KEYS.has(event.code)) {
        event.preventDefault();
        keys.add(event.code);
        apply();
      } else if (event.code === "KeyR") {
        event.preventDefault();
        onResetRef.current();
      } else if (event.code === "Escape") {
        keys.clear();
        apply();
        onExitRef.current();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
      apply();
    };

    const handleBlur = () => {
      keys.clear();
      apply();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    const target = controlsRef.current;
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      Object.assign(target, {
        throttle: 0,
        brake: 0,
        steering: 0,
        handbrake: 0,
      });
    };
    // The callbacks live in refs (see above); only `enabled` controls the
    // subscription lifetime.
  }, [controlsRef, enabled]);
}