import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { extractGrayscaleFrame } from "../ffmpeg/extractGrayscaleFrame.js";
import { detectSobelEdges } from "../vision/sobelEdges.js";
import { detectHorizonTilt } from "../vision/houghHorizonDetect.js";
import { detectVerticalTilt } from "../vision/houghVerticalDetect.js";
import { detectLensDistortion } from "../vision/detectLensDistortion.js";

export interface PerspectiveAnalyzeInput {
  filePath: string;
  atMs: number;
  frameWidth: number;
  frameHeight: number;
}

export interface PerspectiveAnalyzeOutput {
  /** Graus de inclinação do horizonte (0 = nivelado). */
  tiltDegrees: number;
  /** Quão dominante é a linha detectada (0-1) — usado para calibrar confidence. */
  peakStrength: number;
  edgePointCount: number;
  /** Graus de desvio da linha vertical dominante em relação à vertical real (0 = reta). */
  verticalTiltDegrees: number;
  /** Quão dominante é a linha vertical detectada (0-1). */
  verticalPeakStrength: number;
  /** k1 de correção de distorção de lente grande angular (barril) já pronto pra `lenscorrection`; 0 = sem distorção detectada. */
  lensDistortionK1: number;
  /** Quanto a correção de lente melhorou o ajuste da linha reta dominante (0 = sem ganho/sem correção). */
  lensDistortionPeakStrengthGain: number;
}

const MIN_EDGE_POINTS = 30;

/**
 * Capability `perspective.analyze` — docs/CAPABILITY_REGISTRY.md, Vision
 * Layer. Detecção real de horizonte, linhas verticais (quinas de parede,
 * batentes de porta) E distorção de lente grande angular (barril) via Sobel
 * (`../vision/sobelEdges.ts`) + Transformada de Hough
 * (`../vision/houghHorizonDetect.ts` / `../vision/houghVerticalDetect.ts`,
 * ambos wrappers do mesmo núcleo em `../vision/houghLineDetect.ts`;
 * `../vision/detectLensDistortion.ts` busca o `k1` de correção que melhor
 * endireita essas mesmas linhas) — geometria clássica determinística, não um
 * modelo de IA (mesma categoria de `lighting.analyze`/signalstats).
 * Verificada contra vídeos sintéticos com inclinação/distorção conhecida
 * gerados via FFmpeg (`geq`/`lenscorrection`) antes de integrar — ver
 * docs/vision/PERSPECTIVE.md.
 */
export class PerspectiveAnalyzeCapability
  implements Capability<PerspectiveAnalyzeInput, PerspectiveAnalyzeOutput>
{
  readonly id = "perspective.analyze";
  readonly layer = "vision" as const;
  readonly mutatesMedia = false;

  async execute(
    input: PerspectiveAnalyzeInput,
  ): Promise<CapabilityResult<PerspectiveAnalyzeOutput>> {
    const frame = await extractGrayscaleFrame(
      input.filePath,
      input.atMs,
      input.frameWidth,
      input.frameHeight,
    );
    const edges = detectSobelEdges(frame.buffer, frame.width, frame.height);
    const result = detectHorizonTilt(edges, frame.width, frame.height);
    const verticalResult = detectVerticalTilt(edges, frame.width, frame.height);

    if (!result || result.edgePointCount < MIN_EDGE_POINTS) {
      // Cena sem bordas suficientes (ex.: parede lisa, frame muito escuro) —
      // não há sinal confiável, nunca inventamos uma inclinação.
      return {
        output: {
          tiltDegrees: 0,
          peakStrength: 0,
          edgePointCount: edges.length,
          verticalTiltDegrees: 0,
          verticalPeakStrength: 0,
          lensDistortionK1: 0,
          lensDistortionPeakStrengthGain: 0,
        },
        confidence: Confidence.of(20),
      };
    }

    const lensResult = await detectLensDistortion(
      input.filePath,
      input.atMs,
      input.frameWidth,
      input.frameHeight,
    );

    // peakStrength = fração dos pontos de borda que "votaram" na linha
    // vencedora. Cenas reais (com móveis/textura) raramente passam de ~30%;
    // escala calibrada para que isso já produza confidence alta.
    const confidenceValue = Math.round(Math.min(100, result.peakStrength * 300));

    return {
      output: {
        ...result,
        verticalTiltDegrees: verticalResult?.tiltDegrees ?? 0,
        verticalPeakStrength: verticalResult?.peakStrength ?? 0,
        lensDistortionK1: lensResult?.k1 ?? 0,
        lensDistortionPeakStrengthGain: lensResult?.peakStrengthGain ?? 0,
      },
      confidence: Confidence.of(confidenceValue),
    };
  }
}
