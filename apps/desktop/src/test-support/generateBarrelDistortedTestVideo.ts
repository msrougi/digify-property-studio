import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFMPEG_PATH } from "../infrastructure/ffmpeg/paths.js";

const execFileAsync = promisify(execFile);

/**
 * Gera um vídeo sintético real com UMA única borda reta horizontal
 * conhecida (mesmo estilo de `generateTiltedTestVideo.ts` — uma linha só,
 * não uma grade, pra manter a votação do Hough concentrada e o sinal forte,
 * igual os testes de horizonte/vertical), distorcida por uma distorção de
 * lente conhecida (via filtro real `lenscorrection` do próprio FFmpeg,
 * `k1Forward` positivo = distorção de barril, o padrão de lentes grandes
 * angulares reais) — usado para verificar `detectLensDistortion.ts` contra
 * um ground truth exato. `k1Forward` é o "tanto de distorção" conhecido que
 * a correção detectada deve neutralizar.
 */
export async function generateBarrelDistortedTestVideo(
  outputPath: string,
  k1Forward: number,
  options: { width?: number; height?: number; durationSec?: number } = {},
): Promise<void> {
  const width = options.width ?? 640;
  const height = options.height ?? 480;
  const durationSec = options.durationSec ?? 1;
  const edgeY = Math.round(height * 0.35);

  await execFileAsync(FFMPEG_PATH, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=size=${width}x${height}:d=${durationSec},geq=lum='if(gt(Y,${edgeY}),255,0)'`,
    "-vf",
    `lenscorrection=k1=${k1Forward}:k2=0:i=bilinear`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
}
