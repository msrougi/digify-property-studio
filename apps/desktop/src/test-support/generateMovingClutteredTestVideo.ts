import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFMPEG_PATH } from "../infrastructure/ffmpeg/paths.js";

const execFileAsync = promisify(execFile);

export interface MovingClutterPatch {
  /** Posição do retângulo bagunçado no PRIMEIRO quadro. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Quantos pixels o retângulo anda por segundo (simula a câmera andando). */
  driftPxPerSec: number;
}

/**
 * Gera um vídeo real (FFmpeg `geq`, expressão por pixel) com um cômodo liso
 * e um retângulo de xadrez de alto contraste que ANDA ao longo do tempo.
 *
 * O movimento é o ponto: o caminho antigo de home staging gerava um remendo
 * a partir de um único quadro e o colava parado sobre a cena inteira, o que
 * só funciona com câmera imóvel. Vídeo de imóvel real é alguém caminhando
 * pela casa, então a bagunça muda de lugar a cada quadro. Este gerador
 * reproduz exatamente essa condição pra que o teste do
 * `FrameByFrameCleaner` prove a limpeza com câmera em movimento, e não num
 * caso fácil que nunca acontece na prática.
 */
export async function generateMovingClutteredTestVideo(
  outputPath: string,
  size: { width: number; height: number },
  patch: MovingClutterPatch,
  durationSec = 1,
  fps = 10,
): Promise<void> {
  const { width, height } = size;
  const { x, y, width: pw, height: ph, driftPxPerSec } = patch;

  // `T` é o tempo em segundos dentro da expressão do geq: o retângulo
  // desliza no eixo X conforme o vídeo corre.
  const left = `(${x}+${driftPxPerSec}*T)`;
  const right = `(${x + pw}+${driftPxPerSec}*T)`;
  const luma =
    `if(between(X,${left},${right})*between(Y,${y},${y + ph}),` +
    `mod(floor(X/4)+floor(Y/4),2)*215+20,128)`;

  await execFileAsync(FFMPEG_PATH, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=gray:size=${width}x${height}:duration=${durationSec}:rate=${fps},geq=lum='${luma}':cb=128:cr=128`,
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
}
