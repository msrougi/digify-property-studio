import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { measureAverageLuma } from "../ffmpeg/measureAverageLuma.js";

export interface LightingAnalyzeInput {
  filePath: string;
}

export type ExposureClassification = "underexposed" | "normal" | "overexposed";

export interface LightingAnalyzeOutput {
  averageLuma: number;
  classification: ExposureClassification;
}

const UNDEREXPOSED_THRESHOLD = 60;
const OVEREXPOSED_THRESHOLD = 200;

function classify(averageLuma: number): ExposureClassification {
  if (averageLuma < UNDEREXPOSED_THRESHOLD) return "underexposed";
  if (averageLuma > OVEREXPOSED_THRESHOLD) return "overexposed";
  return "normal";
}

/**
 * Capability `lighting.analyze` — docs/CAPABILITY_REGISTRY.md, Vision Layer
 * (somente leitura, nunca modifica mídia — padrão Analyze/Act, ADR-0001 item D).
 * Mede luminância real via FFmpeg `signalstats`. Determinístico, confidence 100.
 */
export class LightingAnalyzeCapability
  implements Capability<LightingAnalyzeInput, LightingAnalyzeOutput>
{
  readonly id = "lighting.analyze";
  readonly layer = "vision" as const;
  readonly mutatesMedia = false;

  async execute(input: LightingAnalyzeInput): Promise<CapabilityResult<LightingAnalyzeOutput>> {
    const averageLuma = await measureAverageLuma(input.filePath);

    return {
      output: { averageLuma, classification: classify(averageLuma) },
      confidence: Confidence.of(100),
    };
  }
}
