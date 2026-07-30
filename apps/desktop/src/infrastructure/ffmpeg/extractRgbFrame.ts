import { spawn } from "node:child_process";
import { FFMPEG_PATH } from "./paths.js";

export interface RgbFrame {
  /** 3 bytes por pixel (RGB24), row-major. */
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Extrai um frame real em RGB24, redimensionado (preservando proporção) pra
 * caber em `maxWidth` — usado por `reflectionSuppress.ts` via
 * `ReflectionAnalyzeCapability`/`ReflectionActCapability`. O custo do
 * solver de supressão de reflexo escala de forma não-linear com o número de
 * pixels (ver `docs/vision/REFLECTION.md`), por isso o cap é ajustável por
 * chamada (análise usa uma resolução menor/mais rápida; a correção final
 * usa uma maior).
 */
export function extractRgbFrame(
  filePath: string,
  atMs: number,
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
): Promise<RgbFrame> {
  const scale = Math.min(1, maxWidth / originalWidth);
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
      "rgb24",
      "-",
    ]);

    const chunks: Buffer[] = [];
    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.on("error", reject);

    ffmpeg.on("close", () => {
      const buffer = Buffer.concat(chunks);
      const expectedBytes = width * height * 3;
      if (buffer.length !== expectedBytes) {
        reject(
          new Error(`Frame RGB24 com tamanho inesperado: ${buffer.length} bytes (esperado ${expectedBytes})`),
        );
        return;
      }
      resolve({ buffer, width, height });
    });
  });
}
