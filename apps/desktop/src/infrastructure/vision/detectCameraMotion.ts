import { extractGrayscaleFrame } from "../ffmpeg/extractGrayscaleFrame.js";

export interface CameraMotionResult {
  /** Diferença média absoluta de luma (0–255) entre início e fim da cena. */
  motionScore: number;
  /** false quando a câmera se move o bastante pra quebrar uma correção estática (overlay colado num único frame) durante a cena inteira. */
  isStatic: boolean;
}

/**
 * Overlays de imagem estática (`reflection.act`, `home_staging.act` com
 * inpainting real) só fazem sentido visual quando a câmera não se move
 * durante a cena — senão o patch gerado a partir de UM frame fica "colado"
 * sobre um vídeo que muda de enquadramento, virando um artefato óbvio
 * (bug real encontrado testando num vídeo de imóvel de verdade: a câmera
 * quase sempre anda pela cena). Mede isso comparando dois frames reais
 * (início e fim da cena, com margem pra evitar quadros de transição de
 * corte) — nunca assume, sempre mede.
 */
const STATIC_MOTION_THRESHOLD = 12;
/** Margem em relação às bordas da cena, pra não pegar frames de transição de corte. */
const EDGE_MARGIN_RATIO = 0.15;

export async function detectCameraMotion(
  filePath: string,
  sceneStartMs: number,
  sceneEndMs: number,
  frameWidth: number,
  frameHeight: number,
): Promise<CameraMotionResult> {
  const durationMs = Math.max(0, sceneEndMs - sceneStartMs);
  const margin = durationMs * EDGE_MARGIN_RATIO;
  const startAtMs = sceneStartMs + margin;
  const endAtMs = Math.max(startAtMs, sceneEndMs - margin);

  const [startFrame, endFrame] = await Promise.all([
    extractGrayscaleFrame(filePath, startAtMs, frameWidth, frameHeight),
    extractGrayscaleFrame(filePath, endAtMs, frameWidth, frameHeight),
  ]);

  const motionScore = meanAbsoluteDifference(startFrame.buffer, endFrame.buffer);

  return { motionScore, isStatic: motionScore < STATIC_MOTION_THRESHOLD };
}

function meanAbsoluteDifference(a: Buffer, b: Buffer): number {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += Math.abs((a[i] as number) - (b[i] as number));
  }
  return length > 0 ? sum / length : 0;
}
