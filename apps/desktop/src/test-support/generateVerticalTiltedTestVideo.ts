import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFMPEG_PATH } from "../infrastructure/ffmpeg/paths.js";

const execFileAsync = promisify(execFile);

/**
 * Gera um vídeo sintético real com uma borda vertical em um ângulo conhecido
 * (via filtro `geq` do FFmpeg) — mesmo princípio de `generateTiltedTestVideo.ts`,
 * mas com o eixo trocado (linha que varia em X conforme Y, não em Y conforme X).
 * Usado para verificar `detectVerticalTilt` contra um ground truth exato.
 */
export async function generateVerticalTiltedTestVideo(
  outputPath: string,
  tiltDegrees: number,
  options: { width?: number; height?: number; durationSec?: number } = {},
): Promise<void> {
  const width = options.width ?? 320;
  const height = options.height ?? 240;
  const durationSec = options.durationSec ?? 1;
  const slope = Math.tan((tiltDegrees * Math.PI) / 180);

  const lumaExpr = `if(gt(X,${width / 2}+(Y-${height / 2})*${slope}),255,0)`;

  await execFileAsync(FFMPEG_PATH, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=size=${width}x${height}:d=${durationSec},geq=lum='${lumaExpr}'`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
}
