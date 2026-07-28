import type { EdgePoint } from "./sobelEdges.js";

export interface HorizonDetectionResult {
  /** Graus de inclinação do horizonte em relação ao nível (0 = perfeitamente nivelado). */
  tiltDegrees: number;
  /** Fração dos pontos de borda que "votaram" na linha vencedora — quão dominante ela é. */
  peakStrength: number;
  edgePointCount: number;
}

/** Só busca linhas próximas da horizontal (±45°) — o que interessa para nivelar o horizonte. */
const THETA_MIN_DEG = 45;
const THETA_MAX_DEG = 135;
const THETA_STEP_DEG = 1;

/**
 * Transformada de Hough real (parametrização rho/theta clássica) restrita a
 * ângulos próximos da horizontal, para encontrar a linha reta dominante nos
 * pontos de borda (`sobelEdges.ts`) — candidata a horizonte/linha de
 * referência. Não é IA: é geometria/votação determinística, como o resto do
 * pipeline `lighting.analyze` (signalstats).
 */
export function detectHorizonTilt(
  edges: EdgePoint[],
  width: number,
  height: number,
): HorizonDetectionResult | null {
  if (edges.length === 0) return null;

  const diag = Math.sqrt(width * width + height * height);
  const rhoOffset = Math.round(diag);
  const rhoBins = rhoOffset * 2 + 1;

  const thetaCount = Math.round((THETA_MAX_DEG - THETA_MIN_DEG) / THETA_STEP_DEG) + 1;
  const cosTable = new Float64Array(thetaCount);
  const sinTable = new Float64Array(thetaCount);
  for (let i = 0; i < thetaCount; i++) {
    const thetaRad = ((THETA_MIN_DEG + i * THETA_STEP_DEG) * Math.PI) / 180;
    cosTable[i] = Math.cos(thetaRad);
    sinTable[i] = Math.sin(thetaRad);
  }

  const accumulator = new Uint32Array(thetaCount * rhoBins);

  for (const { x, y } of edges) {
    for (let i = 0; i < thetaCount; i++) {
      const rho = x * (cosTable[i] as number) + y * (sinTable[i] as number);
      const rhoIndex = Math.round(rho) + rhoOffset;
      accumulator[i * rhoBins + rhoIndex] = (accumulator[i * rhoBins + rhoIndex] as number) + 1;
    }
  }

  let bestIndex = 0;
  let bestVotes = 0;
  for (let i = 0; i < accumulator.length; i++) {
    const votes = accumulator[i] as number;
    if (votes > bestVotes) {
      bestVotes = votes;
      bestIndex = i;
    }
  }

  const bestThetaIndex = Math.floor(bestIndex / rhoBins);
  const bestThetaDeg = THETA_MIN_DEG + bestThetaIndex * THETA_STEP_DEG;

  // theta=90° (normal apontando pra baixo) descreve uma linha horizontal
  // (x*cos90 + y*sin90 = y = rho) — inclinação é o desvio disso.
  const tiltDegrees = bestThetaDeg - 90;
  const peakStrength = bestVotes / edges.length;

  return { tiltDegrees, peakStrength, edgePointCount: edges.length };
}
