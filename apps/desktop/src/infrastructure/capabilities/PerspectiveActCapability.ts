import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { computeSafeCropAfterRotation } from "../vision/rotatedRectCrop.js";
import type { PerspectiveAnalyzeOutput } from "./PerspectiveAnalyzeCapability.js";

export interface PerspectiveActInput extends PerspectiveAnalyzeOutput {
  frameWidth: number;
  frameHeight: number;
}

export interface PerspectiveActOutput {
  /** null quando nenhuma correção é aplicada (já nivelado ou sinal não confiável). */
  ffmpegFilter: string | null;
  needsCorrection: boolean;
  description: string;
}

/** Abaixo disso, a diferença é imperceptível — corrigir só introduziria recorte desnecessário. */
const TILT_THRESHOLD_DEGREES = 1.5;
/** Clampa a correção — ângulos maiores geralmente indicam detecção errada, não câmera realmente torta. */
const MAX_CORRECTION_DEGREES = 8;
/** Abaixo disso, `perspective.analyze` não tinha uma linha dominante clara — não arriscamos corrigir. */
const MIN_RELIABLE_PEAK_STRENGTH = 0.1;

/**
 * Capability `perspective.act` — docs/CAPABILITY_REGISTRY.md, Production
 * Layer. Decide o filtro FFmpeg que nivela o horizonte a partir de
 * `perspective.analyze` (não executa — quem executa é o Rendering Engine).
 * Rotaciona e recorta pela maior área sem cantos pretos (`../vision/rotatedRectCrop.ts`)
 * em vez de expandir o canvas, depois reescala para o tamanho original.
 */
export class PerspectiveActCapability
  implements Capability<PerspectiveActInput, PerspectiveActOutput>
{
  readonly id = "perspective.act";
  readonly layer = "production" as const;
  readonly mutatesMedia = true;

  async execute(input: PerspectiveActInput): Promise<CapabilityResult<PerspectiveActOutput>> {
    if (Math.abs(input.tiltDegrees) < TILT_THRESHOLD_DEGREES) {
      return {
        output: {
          ffmpegFilter: null,
          needsCorrection: false,
          description: "Horizonte já está nivelado — nenhuma correção necessária.",
        },
        confidence: Confidence.of(100),
      };
    }

    if (input.peakStrength < MIN_RELIABLE_PEAK_STRENGTH) {
      return {
        output: {
          ffmpegFilter: null,
          needsCorrection: false,
          description:
            "Não encontramos uma linha de horizonte confiável nesta cena — nenhuma correção aplicada.",
        },
        confidence: Confidence.of(40),
      };
    }

    const clampedTilt = Math.max(
      -MAX_CORRECTION_DEGREES,
      Math.min(MAX_CORRECTION_DEGREES, input.tiltDegrees),
    );
    const correctionRadians = (-clampedTilt * Math.PI) / 180;

    const crop = computeSafeCropAfterRotation(
      input.frameWidth,
      input.frameHeight,
      correctionRadians,
    );
    const cropWidth = Math.max(2, Math.floor(crop.width / 2) * 2);
    const cropHeight = Math.max(2, Math.floor(crop.height / 2) * 2);
    const cropX = Math.floor((input.frameWidth - cropWidth) / 2);
    const cropY = Math.floor((input.frameHeight - cropHeight) / 2);

    const ffmpegFilter =
      `rotate=${correctionRadians.toFixed(6)}:fillcolor=black,` +
      `crop=${cropWidth}:${cropHeight}:${cropX}:${cropY},` +
      `scale=${input.frameWidth}:${input.frameHeight}`;

    const direction = clampedTilt > 0 ? "sentido horário" : "sentido anti-horário";

    return {
      output: {
        ffmpegFilter,
        needsCorrection: true,
        description: `Horizonte corrigido em ${Math.abs(clampedTilt).toFixed(1)}° (${direction}).`,
      },
      // Correção geométrica recorta bordas do frame — sempre invasiva o
      // bastante para pedir confirmação, mesmo com detecção confiável
      // (mesma lógica de gate do home_staging.act).
      confidence: Confidence.of(75),
    };
  }
}
