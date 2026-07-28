import { spawn } from "node:child_process";
import { FFMPEG_PATH } from "./paths.js";

export interface LetterboxedFrame {
  /** BGR24 (HWC), targetSize x targetSize — ordem de canal exigida pelo YOLOX. */
  buffer: Buffer;
  /** Fator de escala aplicado (mesma fórmula do preprocessamento oficial do YOLOX). */
  ratio: number;
}

/**
 * Extrai um frame com letterbox (preserva aspect ratio, preenche com cinza
 * 114/0x72, ancorado no canto superior esquerdo) — mesmo preprocessamento do
 * YOLOX original (`yolox/data/data_augment.py::preproc`), delegado ao FFmpeg
 * em vez de reimplementar redimensionamento de imagem em JS.
 */
export function extractLetterboxedFrame(
  filePath: string,
  atMs: number,
  originalWidth: number,
  originalHeight: number,
  targetSize = 416,
): Promise<LetterboxedFrame> {
  return new Promise((resolve, reject) => {
    const seconds = (atMs / 1000).toFixed(3);
    const ffmpeg = spawn(FFMPEG_PATH, [
      "-ss",
      seconds,
      "-i",
      filePath,
      "-vf",
      `scale=${targetSize}:${targetSize}:force_original_aspect_ratio=decrease,pad=${targetSize}:${targetSize}:0:0:0x727272`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "bgr24",
      "-",
    ]);

    const chunks: Buffer[] = [];
    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.on("error", reject);

    ffmpeg.on("close", () => {
      const buffer = Buffer.concat(chunks);
      const expectedBytes = targetSize * targetSize * 3;
      if (buffer.length !== expectedBytes) {
        reject(
          new Error(
            `Frame letterboxed com tamanho inesperado: ${buffer.length} bytes (esperado ${expectedBytes})`,
          ),
        );
        return;
      }

      const ratio = Math.min(targetSize / originalHeight, targetSize / originalWidth);
      resolve({ buffer, ratio });
    });
  });
}
