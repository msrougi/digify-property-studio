import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFMPEG_PATH } from "../ffmpeg/paths.js";
import type { ExportPreset } from "./exportPresets.js";

const execFileAsync = promisify(execFile);

/**
 * Gera uma variante real do vídeo pro preset pedido: escala preenchendo todo
 * o quadro alvo (`force_original_aspect_ratio=increase` + `crop`, cobre sem
 * distorcer, cortando o excesso — mesma técnica de "preencher e cortar" de
 * qualquer editor de vídeo) e recodifica no bitrate recomendado da rede.
 * Nunca sobrescreve o vídeo já renderizado — sempre um arquivo novo.
 */
export async function renderExportPreset(
  sourcePath: string,
  outputPath: string,
  preset: ExportPreset,
): Promise<void> {
  const filter =
    `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=increase,` +
    `crop=${preset.width}:${preset.height},setsar=1`;

  await execFileAsync(FFMPEG_PATH, [
    "-y",
    "-i",
    sourcePath,
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-b:v",
    `${preset.videoBitrateKbps}k`,
    "-maxrate",
    `${Math.round(preset.videoBitrateKbps * 1.5)}k`,
    "-bufsize",
    `${preset.videoBitrateKbps * 2}k`,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outputPath,
  ]);
}
