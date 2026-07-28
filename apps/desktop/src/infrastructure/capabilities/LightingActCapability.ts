import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import type { ExposureClassification } from "./LightingAnalyzeCapability.js";

export interface LightingActInput {
  averageLuma: number;
  classification: ExposureClassification;
}

export interface LightingActOutput {
  needsCorrection: boolean;
  /** Filtro FFmpeg pronto para o Rendering Engine aplicar — esta capability decide, nunca executa. */
  ffmpegFilter: string | null;
  description: string;
}

const TARGET_LUMA = 128;

/**
 * Capability `lighting.act` — docs/CAPABILITY_REGISTRY.md, Production Layer.
 * Decide a correção de exposição a partir de `lighting.analyze` (padrão
 * Analyze/Act, ADR-0001 item D). "A IA decide. O Rendering Engine executa."
 * (docs/reference/original-docs/11 - Rendering Engine.md) — por isso esta
 * capability nunca roda ffmpeg, apenas calcula o filtro necessário.
 */
export class LightingActCapability implements Capability<LightingActInput, LightingActOutput> {
  readonly id = "lighting.act";
  readonly layer = "production" as const;
  readonly mutatesMedia = true;

  async execute(input: LightingActInput): Promise<CapabilityResult<LightingActOutput>> {
    if (input.classification === "normal") {
      return {
        output: {
          needsCorrection: false,
          ffmpegFilter: null,
          description: "Exposição dentro da faixa ideal — nenhuma correção necessária.",
        },
        confidence: Confidence.of(100),
      };
    }

    // Correção proporcional à distância do alvo, normalizada para a escala de
    // brightness do filtro `eq` do FFmpeg (-1.0 a 1.0).
    const brightnessDelta = (TARGET_LUMA - input.averageLuma) / 255;
    const clampedDelta = Math.max(-0.5, Math.min(0.5, brightnessDelta));

    return {
      output: {
        needsCorrection: true,
        ffmpegFilter: `eq=brightness=${clampedDelta.toFixed(3)}`,
        description:
          input.classification === "underexposed"
            ? "Vídeo subexposto — aplicando correção de brilho. Nunca altera a atmosfera original além do necessário para leitura do ambiente."
            : "Vídeo superexposto — reduzindo brilho para recuperar detalhes.",
      },
      confidence: Confidence.of(100),
    };
  }
}
