import { extractGrayscaleFrame } from "../ffmpeg/extractGrayscaleFrame.js";
import { detectSobelEdges } from "./sobelEdges.js";
import { detectHorizonTilt } from "./houghHorizonDetect.js";
import { detectVerticalTilt } from "./houghVerticalDetect.js";

export interface LensDistortionResult {
  /** k1 de correção pronto pra aplicar em `lenscorrection=k1=...:k2=0` — já a direção certa, sem precisar inverter sinal. */
  k1: number;
  /** Melhor peakStrength (horizonte OU vertical) obtido com essa correção. */
  peakStrength: number;
  /** Quanto peakStrength melhorou em relação a não corrigir nada (k1=0). */
  peakStrengthGain: number;
}

/**
 * Candidatos de correção testados, só na direção negativa (correção de
 * distorção de BARRIL — o padrão real de lentes grandes angulares/GoPro-like
 * usadas em vídeos imobiliários). Verificado empiricamente com um frame
 * totalmente branco: corrigir distorção de barril com k1 negativo nunca
 * deixa cantos pretos (a reamostragem sempre fica dentro dos limites da
 * imagem de entrada) — só a direção oposta (pincushion, k1 positivo)
 * precisaria de recorte depois, e essa não é a distorção que lentes grande
 * angulares produzem, então não é buscada (ver docs/vision/PERSPECTIVE.md).
 */
const CANDIDATE_K1S = [-0.05, -0.10, -0.15, -0.20, -0.25, -0.30, -0.35];

/** Ganho mínimo de peakStrength sobre não corrigir nada pra considerar a distorção real (não ruído). */
const MIN_PEAK_STRENGTH_GAIN = 0.03;
/** peakStrength mínimo absoluto da melhor correção pra confiar nela. */
const MIN_PEAK_STRENGTH = 0.08;

function bestLinePeakStrength(edges: ReturnType<typeof detectSobelEdges>, width: number, height: number): number {
  const horizon = detectHorizonTilt(edges, width, height);
  const vertical = detectVerticalTilt(edges, width, height);
  return Math.max(horizon?.peakStrength ?? 0, vertical?.peakStrength ?? 0);
}

/**
 * Capability de Vision (usada por `PerspectiveAnalyzeCapability`) que
 * detecta distorção de lente grande angular (barril) por BUSCA real: testa
 * cada candidato de `k1` de correção aplicando de verdade o filtro
 * `lenscorrection` do FFmpeg sobre o frame de referência (via
 * `extractGrayscaleFrame`) e mede se as linhas retas dominantes (Sobel +
 * Hough, mesma infraestrutura de `houghHorizonDetect`/`houghVerticalDetect`)
 * ficam mais retas (peakStrength maior) do que sem correção nenhuma.
 *
 * Não depende de uma fórmula analítica da distorção — a busca É a
 * calibração, feita ao vivo sobre o frame real, o que evita ter que
 * reimplementar/confiar cegamente na fórmula geométrica interna do filtro
 * `lenscorrection` do FFmpeg.
 */
export async function detectLensDistortion(
  filePath: string,
  atMs: number,
  frameWidth: number,
  frameHeight: number,
): Promise<LensDistortionResult | null> {
  const baselineFrame = await extractGrayscaleFrame(filePath, atMs, frameWidth, frameHeight);
  const baselineEdges = detectSobelEdges(baselineFrame.buffer, baselineFrame.width, baselineFrame.height);
  const baselinePeakStrength = bestLinePeakStrength(baselineEdges, baselineFrame.width, baselineFrame.height);

  let best: LensDistortionResult = { k1: 0, peakStrength: baselinePeakStrength, peakStrengthGain: 0 };

  for (const k1 of CANDIDATE_K1S) {
    const frame = await extractGrayscaleFrame(filePath, atMs, frameWidth, frameHeight, k1);
    const edges = detectSobelEdges(frame.buffer, frame.width, frame.height);
    const peakStrength = bestLinePeakStrength(edges, frame.width, frame.height);
    if (peakStrength > best.peakStrength) {
      best = { k1, peakStrength, peakStrengthGain: peakStrength - baselinePeakStrength };
    }
  }

  if (
    best.k1 !== 0 &&
    best.peakStrengthGain >= MIN_PEAK_STRENGTH_GAIN &&
    best.peakStrength >= MIN_PEAK_STRENGTH
  ) {
    return best;
  }

  return null;
}
