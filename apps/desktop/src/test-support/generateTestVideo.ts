import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFMPEG_PATH } from "../infrastructure/ffmpeg/paths.js";

const execFileAsync = promisify(execFile);

export interface VideoSegment {
  color: string;
  durationSec: number;
}

/**
 * Gera um vídeo sintético real (via FFmpeg lavfi) para testes — nunca usamos
 * arquivos de vídeo fake/texto. Cada segmento de cor diferente produz um corte de
 * cena real, detectável pelo filtro `scene` do FFmpeg.
 */
export async function generateTestVideo(
  outputPath: string,
  segments: VideoSegment[],
  options: { size?: string; fps?: number } = {},
): Promise<void> {
  const size = options.size ?? "64x64";
  const fps = options.fps ?? 10;

  const inputs = segments.flatMap((segment) => [
    "-f",
    "lavfi",
    "-i",
    `color=${segment.color}:size=${size}:duration=${segment.durationSec}:rate=${fps}`,
  ]);

  const filterInputs = segments.map((_, index) => `[${index}:v]`).join("");
  const filterComplex = `${filterInputs}concat=n=${segments.length}:v=1:a=0[outv]`;

  await execFileAsync(FFMPEG_PATH, [
    "-y",
    ...inputs,
    "-filter_complex",
    filterComplex,
    "-map",
    "[outv]",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
}
