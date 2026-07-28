import type { EdgePoint } from "./sobelEdges.js";
import { detectDominantLineTilt } from "./houghLineDetect.js";

export interface VerticalDetectionResult {
  /** Graus de desvio da linha vertical dominante em relação à vertical real (0 = perfeitamente vertical). */
  tiltDegrees: number;
  /** Fração dos pontos de borda que "votaram" na linha vencedora — quão dominante ela é. */
  peakStrength: number;
  edgePointCount: number;
}

/**
 * Detecta a linha vertical dominante (quinas de parede, batentes de porta,
 * cantos de móveis) — wrapper de `detectDominantLineTilt`
 * (`houghLineDetect.ts`) com a referência fixa em 0° (theta=0° descreve uma
 * linha vertical: x*cos0 + y*sin0 = x = rho).
 */
export function detectVerticalTilt(
  edges: EdgePoint[],
  width: number,
  height: number,
): VerticalDetectionResult | null {
  const result = detectDominantLineTilt(edges, width, height, 0);
  if (!result) return null;
  // A parametrização rho/theta dá x ≈ rho - theta*y perto de theta=0 (x
  // diminui com y para theta positivo) -- convenção oposta à intuitiva
  // "base da linha desloca pra direita = tilt positivo". Inverte o sinal
  // aqui pra bater com essa intuição (mesma convenção usada nos testes com
  // ground truth conhecido).
  return { ...result, tiltDegrees: -result.tiltDegrees + 0 };
}
