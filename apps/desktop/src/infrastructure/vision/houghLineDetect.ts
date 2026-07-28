import type { EdgePoint } from "./sobelEdges.js";

export interface LineDetectionResult {
  /** Graus de desvio da linha dominante em relação à referência (horizontal ou vertical) pedida. */
  tiltDegrees: number;
  /** Fração dos pontos de borda que "votaram" na linha vencedora — quão dominante ela é. */
  peakStrength: number;
  edgePointCount: number;
}

/**
 * Núcleo real da Transformada de Hough (parametrização rho/theta clássica),
 * restrito a uma faixa de ângulos ao redor de `referenceThetaDeg` — encontra
 * a linha reta dominante nos pontos de borda (`sobelEdges.ts`) por votação.
 * Não é IA: geometria/votação determinística, mesma categoria de
 * `lighting.analyze` (signalstats). Usado tanto para horizonte
 * (referenceThetaDeg=90, linhas horizontais) quanto para linhas verticais
 * (referenceThetaDeg=0).
 */
export function detectDominantLineTilt(
  edges: EdgePoint[],
  width: number,
  height: number,
  referenceThetaDeg: number,
  searchRangeDeg = 45,
  stepDeg = 1,
): LineDetectionResult | null {
  if (edges.length === 0) return null;

  const thetaMinDeg = referenceThetaDeg - searchRangeDeg;
  const thetaMaxDeg = referenceThetaDeg + searchRangeDeg;

  const diag = Math.sqrt(width * width + height * height);
  const rhoOffset = Math.round(diag);
  const rhoBins = rhoOffset * 2 + 1;

  const thetaCount = Math.round((thetaMaxDeg - thetaMinDeg) / stepDeg) + 1;
  const cosTable = new Float64Array(thetaCount);
  const sinTable = new Float64Array(thetaCount);
  for (let i = 0; i < thetaCount; i++) {
    const thetaRad = ((thetaMinDeg + i * stepDeg) * Math.PI) / 180;
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
  const bestThetaDeg = thetaMinDeg + bestThetaIndex * stepDeg;

  const tiltDegrees = bestThetaDeg - referenceThetaDeg;
  const peakStrength = bestVotes / edges.length;

  return { tiltDegrees, peakStrength, edgePointCount: edges.length };
}
