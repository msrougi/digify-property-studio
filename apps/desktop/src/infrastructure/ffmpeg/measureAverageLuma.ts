import { spawn } from "node:child_process";
import { FFMPEG_PATH } from "./paths.js";

const YAVG_PATTERN = /lavfi\.signalstats\.YAVG=([0-9]+\.?[0-9]*)/g;

/**
 * Mede a luminância média real do vídeo via filtro `signalstats` do FFmpeg
 * (0 = preto absoluto, 255 = branco absoluto; FFmpeg usa range de estúdio
 * 16–235 por padrão). Processamento de sinal determinístico, não é IA.
 */
export function measureAverageLuma(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, [
      "-i",
      filePath,
      "-vf",
      "signalstats,metadata=print",
      "-f",
      "null",
      "-",
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", reject);

    ffmpeg.on("close", (code) => {
      const values = [...stderr.matchAll(YAVG_PATTERN)].map((match) => Number(match[1]));

      if (values.length === 0) {
        reject(new Error(`Não foi possível medir luminância de ${filePath} (código ${code})`));
        return;
      }

      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      resolve(Math.round(average * 100) / 100);
    });
  });
}
