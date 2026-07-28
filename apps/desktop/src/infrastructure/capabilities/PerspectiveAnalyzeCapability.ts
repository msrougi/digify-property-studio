import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { extractGrayscaleFrame } from "../ffmpeg/extractGrayscaleFrame.js";
import { detectSobelEdges } from "../vision/sobelEdges.js";
import { detectHorizonTilt } from "../vision/houghHorizonDetect.js";

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
}

const MIN_EDGE_POINTS = 30;

/**
 * Capability `perspective.analyze` — docs/CAPABILITY_REGISTRY.md, Vision
 * Layer. Detecção real de horizonte via Sobel (`../vision/sobelEdges.ts`) +
 * Transformada de Hough (`../vision/houghHorizonDetect.ts`) — geometria
 * clássica determinística, não um modelo de IA (mesma categoria de
 * `lighting.analyze`/signalstats). Verificada contra vídeos sintéticos com
 * inclinação conhecida gerados via FFmpeg (`geq`) antes de integrar — ver
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

    if (!result || result.edgePointCount < MIN_EDGE_POINTS) {
      // Cena sem bordas suficientes (ex.: parede lisa, frame muito escuro) —
      // não há sinal confiável, nunca inventamos uma inclinação.
      return {
        output: { tiltDegrees: 0, peakStrength: 0, edgePointCount: edges.length },
        confidence: Confidence.of(20),
      };
    }

    // peakStrength = fração dos pontos de borda que "votaram" na linha
    // vencedora. Cenas reais (com móveis/textura) raramente passam de ~30%;
    // escala calibrada para que isso já produza confidence alta.
    const confidenceValue = Math.round(Math.min(100, result.peakStrength * 300));

    return {
      output: result,
      confidence: Confidence.of(confidenceValue),
    };
  }
}
