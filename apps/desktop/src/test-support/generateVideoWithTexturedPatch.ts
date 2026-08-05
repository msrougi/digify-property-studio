import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFMPEG_PATH } from "../infrastructure/ffmpeg/paths.js";

const execFileAsync = promisify(execFile);

/**
 * Gera um vídeo real (via FFmpeg `geq`, expressão por pixel — nunca um
 * arquivo fake) com fundo liso e um retângulo de xadrez de alto contraste
 * numa posição conhecida, simulando bagunça real localizada sobre um
 * cômodo majoritariamente uniforme — usado pra testar `clutter.detect` de
 * ponta a ponta (extração de frame real incluída, não só o algoritmo puro).
 */
export async function generateVideoWithTexturedPatch(
  outputPath: string,
  size: { width: number; height: number },
  patch: { x: number; y: number; width: number; height: number },
  durationSec = 1,
): Promise<void> {
  const { width, height } = size;
  const { x, y, width: pw, height: ph } = patch;

  const luma = `if(between(X,${x},${x + pw})*between(Y,${y},${y + ph}),mod(floor(X/4)+floor(Y/4),2)*215+20,128)`;

  await execFileAsync(FFMPEG_PATH, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=gray:size=${width}x${height}:duration=${durationSec}:rate=10,geq=lum='${luma}':cb=128:cr=128`,
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
}
