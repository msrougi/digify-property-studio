import { spawn } from "node:child_process";
import { FFMPEG_PATH } from "../ffmpeg/paths.js";
import { readVideoMetadata } from "../ffmpeg/ffprobeMetadata.js";

/** Progresso real medido a partir da própria saída do FFmpeg (`-progress`), nunca simulado. */
export interface RenderProgress {
  /** 0–100, calculado a partir do tempo de vídeo já processado / duração total real. */
  percent: number;
  elapsedMs: number;
}

export interface ImageOverlay {
  /** Imagem estática já gerada (ex.: patch de inpainting real) a compor sobre o vídeo. */
  imagePath: string;
  x: number;
  y: number;
  /** Sem startSec/endSec, o overlay vale para o vídeo inteiro. */
  startSec?: number;
  endSec?: number;
  /** Redimensiona o overlay antes de compor (ex.: correção de reflexo gerada numa resolução menor que o frame real). Sem isso, usa o tamanho nativo da imagem. */
  width?: number;
  height?: number;
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
  async render(request: RenderRequest, onProgress?: (progress: RenderProgress) => void): Promise<RenderResult> {
    const overlays = request.overlays ?? [];

    const args =
      overlays.length > 0
        ? await this.buildOverlayArgs(request, overlays)
        : this.buildSimpleArgs(request);

    // Duração total real do vídeo de origem — base pra converter o tempo já
    // processado (reportado pelo próprio FFmpeg via `-progress`) numa
    // porcentagem real, nunca uma animação simulada.
    const { durationMs: totalDurationMs } = await readVideoMetadata(request.sourcePath);
    await this.runFfmpeg(args, totalDurationMs, onProgress);

    return { outputPath: request.outputPath };
  }

  /**
   * Roda o FFmpeg via `spawn` (em vez de `execFile`, que só resolve/rejeita no
   * final) pra poder ler `-progress pipe:1` linha a linha enquanto o processo
   * roda — é isso que permite reportar tempo decorrido e % reais durante o
   * encode, sem esperar terminar.
   */
  private runFfmpeg(
    args: string[],
    totalDurationMs: number,
    onProgress?: (progress: RenderProgress) => void,
  ): Promise<void> {
    const startedAt = Date.now();
    const fullArgs = ["-y", "-progress", "pipe:1", "-nostats", ...args.filter((arg) => arg !== "-y")];

    return new Promise((resolve, reject) => {
      const child = spawn(FFMPEG_PATH, fullArgs);
      let stdoutBuffer = "";
      let stderrOutput = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const outTimeMatch = /^out_time=(\d+):(\d+):(\d+\.\d+)$/.exec(line.trim());
          if (outTimeMatch && onProgress) {
            const [, hours, minutes, seconds] = outTimeMatch as unknown as [string, string, string, string];
            const outTimeMs =
              (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000;
            const percent =
              totalDurationMs > 0 ? Math.min(100, (outTimeMs / totalDurationMs) * 100) : 0;
            onProgress({ percent, elapsedMs: Date.now() - startedAt });
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrOutput += chunk.toString("utf8");
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          onProgress?.({ percent: 100, elapsedMs: Date.now() - startedAt });
          resolve();
        } else {
          reject(new Error(`ffmpeg saiu com código ${code}: ${stderrOutput}`));
        }
      });
    });
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
    const scaleSteps: string[] = [];
    const overlaySteps = overlays.map((overlay, index) => {
      let inputLabel = `[${index + 1}:v]`;
      if (overlay.width !== undefined && overlay.height !== undefined) {
        const scaledLabel = `[scaled${index}]`;
        scaleSteps.push(`${inputLabel}scale=${Math.round(overlay.width)}:${Math.round(overlay.height)}${scaledLabel}`);
        inputLabel = scaledLabel;
      }
      const outputLabel = index === overlays.length - 1 ? "[vout]" : `[v${index}]`;
      const enable =
        overlay.startSec !== undefined && overlay.endSec !== undefined
          ? `:enable='between(t,${overlay.startSec},${overlay.endSec})'`
          : "";
      const step = `${previousLabel}${inputLabel}overlay=x=${Math.round(overlay.x)}:y=${Math.round(overlay.y)}${enable}${outputLabel}`;
      previousLabel = outputLabel;
      return step;
    });

    const filterComplex = [...simpleChain, ...scaleSteps, ...overlaySteps].join(";");

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
