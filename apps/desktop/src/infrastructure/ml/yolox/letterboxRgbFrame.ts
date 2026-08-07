import { resizeRgb } from "../../vision/resizeRgb.js";

export interface LetterboxedRgbFrame {
  /** BGR24 (HWC), size x size — ordem de canal exigida pelo YOLOX. */
  buffer: Buffer;
  /** Fator de escala aplicado (mesma fórmula do preprocessamento oficial do YOLOX). */
  ratio: number;
}

/** Cinza 114 (0x72) — o mesmo preenchimento do `preproc` oficial do YOLOX. */
const PAD_VALUE = 114;

/**
 * Letterbox de um quadro RGB que já está na memória.
 *
 * `extractLetterboxedFrame.ts` faz o mesmo delegando ao FFmpeg, mas só sabe
 * ler de um ARQUIVO num timestamp. Na limpeza quadro a quadro os quadros
 * chegam por streaming, então relançar um FFmpeg por quadro só pra
 * redimensionar seria absurdo — daí esta versão.
 *
 * Preserva a proporção e ancora no canto superior esquerdo, exatamente como
 * o original: é o que faz as caixas devolvidas pelo modelo voltarem pro
 * espaço do quadro só dividindo por `ratio`.
 */
export function letterboxRgbFrame(
  rgb: Buffer,
  width: number,
  height: number,
  size: number,
): LetterboxedRgbFrame {
  const ratio = Math.min(size / width, size / height);
  const scaledWidth = Math.max(1, Math.round(width * ratio));
  const scaledHeight = Math.max(1, Math.round(height * ratio));

  const scaled = resizeRgb(rgb, width, height, scaledWidth, scaledHeight);
  const buffer = Buffer.alloc(size * size * 3, PAD_VALUE);

  for (let y = 0; y < scaledHeight; y++) {
    for (let x = 0; x < scaledWidth; x++) {
      const from = (y * scaledWidth + x) * 3;
      const to = (y * size + x) * 3;
      // RGB -> BGR na mesma passada: o YOLOX foi treinado com ordem BGR
      // (herança do OpenCV), e trocar isso silenciosamente arruinaria a
      // detecção sem dar erro nenhum.
      buffer[to] = scaled[from + 2] as number;
      buffer[to + 1] = scaled[from + 1] as number;
      buffer[to + 2] = scaled[from] as number;
    }
  }

  return { buffer, ratio };
}
