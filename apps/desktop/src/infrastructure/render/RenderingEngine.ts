import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFMPEG_PATH } from "../ffmpeg/paths.js";

const execFileAsync = promisify(execFile);

export interface RenderRequest {
  sourcePath: string;
  outputPath: string;
  /** Filtros já decididos pelas capabilities (ordem de aplicação). */
  filters: string[];
}

export interface RenderResult {
  outputPath: string;
}

/**
 * Rendering Engine — docs/reference/original-docs/11 - Rendering Engine.md.
 * "A IA decide. O Rendering Engine executa. Nunca o contrário." Este módulo
 * nunca decide parâmetros de correção — apenas aplica a cadeia de filtros já
 * decidida pelas capabilities de Production via FFmpeg real. Fica fora da
 * taxonomia de capabilities do PIE™ (mesma decisão do Export Manager,
 * ADR-0001 item E) — é executor, não agente.
 *
 * Modo Standard apenas nesta fase; Preview/High Quality/Production ficam para
 * quando houver necessidade real de diferenciação de qualidade x velocidade.
 */
export class RenderingEngine {
  async render(request: RenderRequest): Promise<RenderResult> {
    const filterArgs =
      request.filters.length > 0 ? ["-vf", request.filters.join(",")] : [];

    await execFileAsync(FFMPEG_PATH, [
      "-y",
      "-i",
      request.sourcePath,
      ...filterArgs,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "copy",
      request.outputPath,
    ]);

    return { outputPath: request.outputPath };
  }
}
