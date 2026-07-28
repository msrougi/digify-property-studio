import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFMPEG_PATH } from "../ffmpeg/paths.js";
import { readVideoMetadata } from "../ffmpeg/ffprobeMetadata.js";

const execFileAsync = promisify(execFile);

export interface ImageOverlay {
  /** Imagem estática já gerada (ex.: patch de inpainting real) a compor sobre o vídeo. */
  imagePath: string;
  x: number;
  y: number;
  /** Sem startSec/endSec, o overlay vale para o vídeo inteiro. */
  startSec?: number;
  endSec?: number;
}

export interface RenderRequest {
  sourcePath: string;
  outputPath: string;
  /** Filtros já decididos pelas capabilities (ordem de aplicação). */
  filters: string[];
  /** Imagens estáticas geradas por capabilities (ex.: `home_staging.act` com inpainting real) a compor sobre o vídeo. */
  overlays?: ImageOverlay[];
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
    const overlays = request.overlays ?? [];

    const args =
      overlays.length > 0
        ? await this.buildOverlayArgs(request, overlays)
        : this.buildSimpleArgs(request);

    await execFileAsync(FFMPEG_PATH, args);

    return { outputPath: request.outputPath };
  }

  /** Caminho original — cadeia simples de filtros num único `-vf` (sem overlays). */
  private buildSimpleArgs(request: RenderRequest): string[] {
    const filterArgs = request.filters.length > 0 ? ["-vf", request.filters.join(",")] : [];

    return [
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
    ];
  }

  /**
   * Caminho com overlays de imagem estática (ex.: patch de inpainting real
   * gerado por `home_staging.act`) — precisa de um filter_complex de verdade
   * (múltiplos streams: o vídeo principal + uma imagem por overlay), não dá
   * pra expressar como uma cadeia simples de `-vf`.
   */
  private async buildOverlayArgs(
    request: RenderRequest,
    overlays: ImageOverlay[],
  ): Promise<string[]> {
    // `-shortest` sozinho não corta de forma confiável um input de imagem em
    // loop (`-loop 1`) — precisa de uma duração explícita por input, senão o
    // ffmpeg trava esperando o stream em loop "terminar" (nunca termina).
    const { durationMs } = await readVideoMetadata(request.sourcePath);
    const durationSec = (durationMs / 1000).toFixed(3);
    const overlayInputs = overlays.flatMap((overlay) => [
      "-loop",
      "1",
      "-t",
      durationSec,
      "-i",
      overlay.imagePath,
    ]);

    const baseLabel = request.filters.length > 0 ? "[base]" : "[0:v]";
    const simpleChain =
      request.filters.length > 0 ? [`[0:v]${request.filters.join(",")}${baseLabel}`] : [];

    let previousLabel = baseLabel;
    const overlaySteps = overlays.map((overlay, index) => {
      const inputLabel = `[${index + 1}:v]`;
      const outputLabel = index === overlays.length - 1 ? "[vout]" : `[v${index}]`;
      const enable =
        overlay.startSec !== undefined && overlay.endSec !== undefined
          ? `:enable='between(t,${overlay.startSec},${overlay.endSec})'`
          : "";
      const step = `${previousLabel}${inputLabel}overlay=x=${Math.round(overlay.x)}:y=${Math.round(overlay.y)}${enable}${outputLabel}`;
      previousLabel = outputLabel;
      return step;
    });

    const filterComplex = [...simpleChain, ...overlaySteps].join(";");

    return [
      "-y",
      "-i",
      request.sourcePath,
      ...overlayInputs,
      "-filter_complex",
      filterComplex,
      "-map",
      "[vout]",
      "-map",
      "0:a?",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "copy",
      request.outputPath,
    ];
  }
}
