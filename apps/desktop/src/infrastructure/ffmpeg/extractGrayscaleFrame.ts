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
 */
export function extractGrayscaleFrame(
  filePath: string,
  atMs: number,
  originalWidth: number,
  originalHeight: number,
): Promise<GrayscaleFrame> {
  const scale = Math.min(1, MAX_WIDTH / originalWidth);
  const width = Math.max(2, Math.round((originalWidth * scale) / 2) * 2);
  const height = Math.max(2, Math.round((originalHeight * scale) / 2) * 2);

  return new Promise((resolve, reject) => {
    const seconds = (atMs / 1000).toFixed(3);
    const ffmpeg = spawn(FFMPEG_PATH, [
      "-ss",
      seconds,
      "-i",
      filePath,
      "-vf",
      `scale=${width}:${height}`,
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
