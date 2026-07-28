import { spawn } from "node:child_process";
import { FFMPEG_PATH } from "./paths.js";

const PTS_TIME_PATTERN = /pts_time:([0-9]+\.?[0-9]*)/g;

/**
 * Detecta cortes de cena reais via filtro `select='gt(scene,threshold)'` do FFmpeg
 * (docs/reference/original-docs/09 - Video Processing Pipeline.md, "Scene
 * Segmentation"). Determinístico — não é um modelo probabilístico, por isso a
 * capability `scene.detect` reporta confidence 100.
 */
export function detectSceneChangeTimestampsMs(
  filePath: string,
  threshold = 0.4,
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, [
      "-i",
      filePath,
      "-filter:v",
      `select='gt(scene,${threshold})',showinfo`,
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
      // FFmpeg sempre retorna código != 0 com "-f null -"; o que importa é ter stderr.
      if (stderr.length === 0 && code !== 0) {
        reject(new Error(`FFmpeg falhou ao processar ${filePath} (código ${code})`));
        return;
      }

      const timestampsMs = [...stderr.matchAll(PTS_TIME_PATTERN)].map((match) =>
        Math.round(Number(match[1]) * 1000),
      );

      resolve(timestampsMs);
    });
  });
}
