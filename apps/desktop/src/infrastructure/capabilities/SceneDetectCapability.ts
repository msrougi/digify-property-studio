import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { detectSceneChangeTimestampsMs } from "../ffmpeg/detectSceneChanges.js";

export interface SceneDetectInput {
  filePath: string;
  durationMs: number;
}

export interface DetectedSceneBoundary {
  startMs: number;
  endMs: number;
}

export interface SceneDetectOutput {
  scenes: DetectedSceneBoundary[];
}

/**
 * Capability `scene.detect` — docs/CAPABILITY_REGISTRY.md, Vision Layer (somente
 * leitura, nunca modifica mídia). Segmentação real via filtro de scene change do
 * FFmpeg (docs/reference/original-docs/09 - Video Processing Pipeline.md).
 */
export class SceneDetectCapability implements Capability<SceneDetectInput, SceneDetectOutput> {
  readonly id = "scene.detect";
  readonly layer = "vision" as const;
  readonly mutatesMedia = false;

  async execute(input: SceneDetectInput): Promise<CapabilityResult<SceneDetectOutput>> {
    const cutTimestampsMs = await detectSceneChangeTimestampsMs(input.filePath);

    const boundaries = [
      0,
      ...cutTimestampsMs.filter((ms) => ms > 0 && ms < input.durationMs),
      input.durationMs,
    ];
    const sortedUniqueBoundaries = [...new Set(boundaries)].sort((a, b) => a - b);

    const scenes: DetectedSceneBoundary[] = [];
    for (let i = 0; i < sortedUniqueBoundaries.length - 1; i++) {
      scenes.push({
        startMs: sortedUniqueBoundaries[i] as number,
        endMs: sortedUniqueBoundaries[i + 1] as number,
      });
    }

    return {
      output: { scenes },
      confidence: Confidence.of(100),
    };
  }
}
