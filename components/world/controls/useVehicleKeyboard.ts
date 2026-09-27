"use client";

import { useEffect } from "react";
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
        (globalThis as unknown as { __SF_KB?: unknown }).__SF_KB = {
          keys: [],
          editable: true,
        };
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
      (globalThis as unknown as { __SF_KB?: unknown }).__SF_KB = {
        keys: [...keys],
        editable: false,
        throttle: controlsRef.current.throttle,
      };
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
        onResetRequested();
      } else if (event.code === "Escape") {
        keys.clear();
        apply();
        onExitRequested();
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
  }, [controlsRef, enabled, onResetRequested, onExitRequested]);
}