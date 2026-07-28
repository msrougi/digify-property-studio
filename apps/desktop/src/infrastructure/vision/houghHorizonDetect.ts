import type { EdgePoint } from "./sobelEdges.js";
import { detectDominantLineTilt } from "./houghLineDetect.js";

export interface HorizonDetectionResult {
  /** Graus de inclinação do horizonte em relação ao nível (0 = perfeitamente nivelado). */
  tiltDegrees: number;
  /** Fração dos pontos de borda que "votaram" na linha vencedora — quão dominante ela é. */
  peakStrength: number;
  edgePointCount: number;
}

/**
 * Detecta a linha horizontal dominante (candidata a horizonte) — wrapper de
 * `detectDominantLineTilt` (`houghLineDetect.ts`) com a referência fixa em
 * 90° (theta=90° descreve uma linha horizontal: x*cos90 + y*sin90 = y = rho).
 */
export function detectHorizonTilt(
  edges: EdgePoint[],
  width: number,
  height: number,
): HorizonDetectionResult | null {
  return detectDominantLineTilt(edges, width, height, 90);
}
