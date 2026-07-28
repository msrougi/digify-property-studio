import { spawn } from "node:child_process";
import { FFMPEG_PATH } from "./paths.js";

export interface GrayscaleFrame {
  /** 1 byte por pixel (luma), row-major. */
  buffer: Buffer;
  width: number;
  height: number;
}

const MAX_WIDTH = 640;

/**
 * Extrai um frame real em escala de cinza, preservando a proporção original
 * (importante para detecção de horizonte — distorcer a proporção distorceria
 * o ângulo medido) e limitado a `MAX_WIDTH` para manter o custo do Hough
 * Transform (`houghHorizonDetect.ts`) baixo.
 *
 * `lensCorrectionK1`, quando informado, aplica o filtro `lenscorrection` do
 * FFmpeg antes da extração — usado por `detectLensDistortion.ts` para testar
 * candidatos de correção de distorção de lente diretamente sobre o frame
 * real (sem precisar reimplementar a fórmula geométrica do filtro em TS).
 */
export function extractGrayscaleFrame(
  filePath: string,
  atMs: number,
  originalWidth: number,
  originalHeight: number,
  lensCorrectionK1?: number,
): Promise<GrayscaleFrame> {
  const scale = Math.min(1, MAX_WIDTH / originalWidth);
  const width = Math.max(2, Math.round((originalWidth * scale) / 2) * 2);
  const height = Math.max(2, Math.round((originalHeight * scale) / 2) * 2);

  const filters = [`scale=${width}:${height}`];
  if (lensCorrectionK1 !== undefined && lensCorrectionK1 !== 0) {
    filters.push(`lenscorrection=k1=${lensCorrectionK1}:k2=0:i=bilinear`);
  }

  return new Promise((resolve, reject) => {
    const seconds = (atMs / 1000).toFixed(3);
    const ffmpeg = spawn(FFMPEG_PATH, [
      "-ss",
      seconds,
      "-i",
      filePath,
      "-vf",
      filters.join(","),
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ]);

    const chunks: Buffer[] = [];
    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.on("error", reject);

    ffmpeg.on("close", () => {
      const buffer = Buffer.concat(chunks);
      const expectedBytes = width * height;
      if (buffer.length !== expectedBytes) {
        reject(
          new Error(
            `Frame em escala de cinza com tamanho inesperado: ${buffer.length} bytes (esperado ${expectedBytes})`,
          ),
        );
        return;
      }
      resolve({ buffer, width, height });
    });
  });
}
