import { spawn } from "node:child_process";
import { FFMPEG_PATH } from "./paths.js";

const FRAME_SIZE = 224;
const FRAME_BYTES = FRAME_SIZE * FRAME_SIZE * 3; // RGB24

/**
 * Extrai um único frame real do vídeo (RGB24 cru, 224x224 — tamanho de entrada
 * padrão de redes ImageNet) no timestamp pedido, via FFmpeg. Sem lib de imagem
 * adicional em Node — evita outro módulo nativo com problema de ABI
 * (docs/ENGINEERING_STANDARDS.md, lição do better-sqlite3/Electron).
 */
export function extractFrameRgb24(filePath: string, atMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const seconds = (atMs / 1000).toFixed(3);
    const ffmpeg = spawn(FFMPEG_PATH, [
      "-ss",
      seconds,
      "-i",
      filePath,
      "-vf",
      `scale=${FRAME_SIZE}:${FRAME_SIZE}`,
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
      if (buffer.length !== FRAME_BYTES) {
        reject(
          new Error(
            `Frame extraído com tamanho inesperado: ${buffer.length} bytes (esperado ${FRAME_BYTES})`,
          ),
        );
        return;
      }
      resolve(buffer);
    });
  });
}
