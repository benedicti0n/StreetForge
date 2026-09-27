"use client";

import { useEffect, useState } from "react";
import { quantizeSemanticMap } from "@/lib/forge-ai/quantizeSemanticMap";
import { parseNormalizedMap } from "@/lib/forge-ai/parseNormalizedMap";
import { buildProceduralWorldFromNormalized } from "@/lib/sketchworld/buildWorld";
import { buildWorldTexture } from "@/lib/sketchworld/buildWorldTexture";

/**
 * DEVELOPMENT-ONLY harness: verifies the AI semantic-map path end-to-end
 * using the synthetic semantic fixture (the expected AI output). Removed
 * before release.
 */
export default function DevAiForgeTestPage() {
  const [report, setReport] = useState<string>("running…");

  useEffect(() => {
    const image = new Image();
    image.onload = async () => {
      try {
        const quantized = await quantizeSemanticMap(image);
        const layout = parseNormalizedMap(quantized.classes, quantized.grid);
        const world = await buildProceduralWorldFromNormalized(layout);

        const { canvas, stats } = buildWorldTexture(world.roadTexture!);

        let roadPixels = 0;
        for (let i = 0; i < layout.roadMask.length; i++) {
          if (layout.roadMask[i] === 1) {
            roadPixels++;
          }
        }

        setReport(
          JSON.stringify(
            {
              roadCoverage: +(roadPixels / (256 * 256)).toFixed(3),
              connectivity: +layout.roadConnectivity.toFixed(2),
              centerlinePoints: layout.centerline.length,
              buildings: layout.buildings.length,
              vegetation: layout.vegetation.length,
              ramps: layout.ramps.length,
              waterPixels: count(layout.waterMask, 256),
              uniqueSemanticClasses: quantized.uniqueClasses.length,
              textureRoadPixels: stats.roadPixels,
              spawns: {
                player: world.spawns.player.position.map((n) => +n.toFixed(1)),
                police: world.spawns.police.position.map((n) => +n.toFixed(1)),
              },
            },
            null,
            1,
          ),
        );
      } catch (error) {
        setReport("ERROR: " + String(error));
      }
    };
    image.src = "/test-fixtures/semantic-map.png";
  }, []);

  return (
    <main className="p-6">
      <h1 className="mb-2 font-mono text-sm">Dev AI forge test</h1>
      <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-200">
        {report}
      </pre>
    </main>
  );
}

function count(mask: Uint8Array, grid: number): number {
  let n = 0;
  for (let i = 0; i < grid * grid; i++) {
    if (mask[i] === 1) {
      n++;
    }
  }
  return n;
}