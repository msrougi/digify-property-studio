import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFMPEG_PATH } from "../ffmpeg/paths.js";

const execFileAsync = promisify(execFile);

/** Fração da largura do quadro que o logo ocupa na arte de abertura. */
const CARD_LOGO_WIDTH_RATIO = 0.45;

/**
 * Gera a arte de abertura/encerramento: o logo centralizado sobre um fundo
 * sólido, já no tamanho exato do vídeo.
 *
 * Vira um PNG comum e entra na lista de slides como qualquer foto — o que
 * significa que todo o caminho já testado (transição, duração, codificação)
 * vale pra ele sem nenhum tratamento especial.
 *
 * `scale=...:force_original_aspect_ratio=decrease` respeita a proporção do
 * logo: uma marca horizontal e uma quadrada dão o mesmo resultado
 * proporcional, sem esticar. Esticar o logo de um cliente seria pior que não
 * ter logo nenhum.
 */
export async function composeLogoCard(
  logoPath: string,
  outputPath: string,
  width: number,
  height: number,
  backgroundColor: string,
): Promise<void> {
  const logoWidth = Math.round(width * CARD_LOGO_WIDTH_RATIO);
  const logoHeight = Math.round(height * CARD_LOGO_WIDTH_RATIO);

  await execFileAsync(FFMPEG_PATH, [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=${backgroundColor}:size=${width}x${height}`,
    "-i", logoPath,
    "-filter_complex",
    // `format=rgba` antes do scale preserva a transparência do PNG; sem isso
    // um logo com fundo transparente ganha fundo preto ao ser redimensionado.
    `[1:v]format=rgba,scale=${logoWidth}:${logoHeight}:force_original_aspect_ratio=decrease[logo];` +
      `[0:v][logo]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p`,
    "-frames:v", "1",
    outputPath,
  ]);
}
