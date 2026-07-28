import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFMPEG_PATH } from "../infrastructure/ffmpeg/paths.js";

const execFileAsync = promisify(execFile);

/**
 * Gera um vídeo sintético real com uma borda reta em um ângulo conhecido
 * (via filtro `geq` do FFmpeg) — usado para verificar `perspective.analyze`
 * contra um ground truth exato, não uma foto ambígua. `tiltDegrees` é o
 * ângulo esperado que `detectHorizonTilt` deve recuperar.
 */
export async function generateTiltedTestVideo(
  outputPath: string,
  tiltDegrees: number,
  options: { width?: number; height?: number; durationSec?: number } = {},
): Promise<void> {
  const width = options.width ?? 320;
  const height = options.height ?? 240;
  const durationSec = options.durationSec ?? 1;
  const slope = Math.tan((tiltDegrees * Math.PI) / 180);

  const lumaExpr = `if(gt(Y,${height / 2}+(X-${width / 2})*${slope}),255,0)`;

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
