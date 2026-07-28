import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";

export interface QualitySharpenOutput {
  ffmpegFilter: string;
  description: string;
}

/**
 * Capability `quality.sharpen` — Production Layer. Decide um realce de
 * nitidez conservador via filtro `unsharp` do FFmpeg (processamento de sinal
 * determinístico, não é super-resolução por IA — ver docs/ml/QUALITY.md para
 * por que Real-ESRGAN foi avaliado e adiado para a camada Cloud/GPU).
 *
 * Parâmetros deliberadamente moderados: "a melhor edição é aquela que parece
 * natural" (docs/reference/original-docs/02 - Product Manifesto.md) — realce
 * agressivo cria halos/artefatos, o oposto do objetivo.
 */
export class QualitySharpenCapability implements Capability<void, QualitySharpenOutput> {
  readonly id = "quality.sharpen";
  readonly layer = "production" as const;
  readonly mutatesMedia = true;

  async execute(): Promise<CapabilityResult<QualitySharpenOutput>> {
    return {
      output: {
        ffmpegFilter: "unsharp=5:5:0.6:5:5:0.0",
        description: "Realce de nitidez sutil (luma apenas, sem afetar cor).",
      },
      confidence: Confidence.of(100),
    };
  }
}
