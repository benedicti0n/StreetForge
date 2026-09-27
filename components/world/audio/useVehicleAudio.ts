"use client";

import { useEffect, type RefObject } from "react";
import type { VehicleTelemetry } from "@/components/world/vehicles/vehicleTypes";
import {
  computeSkidAmount,
  vehicleAudio,
} from "./VehicleAudio";

interface UseVehicleAudioOptions {
  playerTelemetryRef?: RefObject<VehicleTelemetry | null>;
}

export function useVehicleAudio({
  playerTelemetryRef,
}: UseVehicleAudioOptions): void {
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const player = playerTelemetryRef?.current;
      if (player) {
        vehicleAudio.updateEngine(player.speedKmh, player.throttle);
        vehicleAudio.setSkid(
          computeSkidAmount(player.speedKmh, player.handbrake, player.lateralSlip),
        );
        if (player.collisionImpact) {
          vehicleAudio.playCollision(player.collisionImpact);
          player.collisionImpact = undefined;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playerTelemetryRef]);
}