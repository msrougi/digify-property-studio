import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FFMPEG_PATH } from "../ffmpeg/paths.js";
import { buildAssSubtitles, type Caption } from "./buildAssSubtitles.js";

export interface Slide {
  imagePath: string;
  /** Segundos que a imagem fica na tela, já contando a transição. */
  durationSec: number;
  /** Legenda exibida enquanto este slide está no ar. Vazio = sem legenda. */
  caption?: string;
}

export interface SlideshowRequest {
  slides: Slide[];
  outputPath: string;
  /** Pasta pra arquivos auxiliares (legenda). Some junto com o resto da sessão. */
  workDir: string;
  width: number;
  height: number;
  fps?: number;
  transitionSec?: number;
  /** Faixa de áudio opcional. O vídeo é cortado no fim das imagens, nunca no fim da música. */
  audioPath?: string;
}

export interface SlideshowProgress {
  percent: number;
  elapsedMs: number;
}

const DEFAULT_FPS = 30;
const DEFAULT_TRANSITION_SEC = 0.6;
const MIN_SLIDE_SEC = 1;

/** Suaviza a entrada e a saída da música — corte seco soa amador. */
const AUDIO_FADE_IN_SEC = 1;
const AUDIO_FADE_OUT_SEC = 2;

/**
 * Fator de ampliação antes do `zoompan`.
 *
 * O `zoompan` do FFmpeg calcula o recorte em passos inteiros de pixel: numa
 * imagem do tamanho exato da saída, o movimento sai aos trancos ("tremido"),
 * um artefato conhecido do filtro. Ampliar antes dá subpixel de sobra e o
 * movimento fica liso. 2x é o ponto em que o tremor some sem estourar
 * memória — cada quadro intermediário de um 1080p vira 4K.
 */
const ZOOMPAN_SUPERSAMPLE = 2;

/** Quanto a imagem chega a aproximar no fim do movimento. 1.12 = 12%. */
const KEN_BURNS_ZOOM = 1.12;

/**
 * Monta um vídeo a partir de imagens paradas: movimento de câmera simulado
 * (Ken Burns), transições e legendas.
 *
 * Diferente da limpeza de vídeo, aqui **nada é inventado por IA** — é
 * composição determinística. O mesmo conjunto de fotos com os mesmos
 * parâmetros produz sempre o mesmo vídeo, e não existe risco de "deformar" o
 * material do cliente porque nenhum pixel é adivinhado.
 *
 * Tudo num único `filter_complex`: cada imagem vira um fluxo com Ken Burns,
 * os fluxos são encadeados com `xfade`, e a legenda entra por cima do
 * resultado. Uma passagem só de FFmpeg, sem arquivos intermediários por
 * slide.
 */
export class SlideshowRenderer {
  async render(
    request: SlideshowRequest,
    onProgress?: (progress: SlideshowProgress) => void,
  ): Promise<{ outputPath: string; durationSec: number }> {
    if (request.slides.length === 0) {
      throw new Error("Não dá pra montar um vídeo sem nenhuma imagem.");
    }

    const fps = request.fps ?? DEFAULT_FPS;
    const transition = request.transitionSec ?? DEFAULT_TRANSITION_SEC;
    const { width, height } = request;

    // Uma transição consome tempo dos DOIS slides que ela liga: o segundo
    // começa a aparecer antes de o primeiro sair. Sem descontar isso, a
    // duração pedida e a real divergem e a legenda dessincroniza.
    const slides = request.slides.map((slide) => ({
      ...slide,
      durationSec: Math.max(MIN_SLIDE_SEC, slide.durationSec),
    }));
    const totalDurationSec =
      slides.reduce((sum, slide) => sum + slide.durationSec, 0) -
      transition * (slides.length - 1);

    const { filter, lastLabel } = this.buildFilterGraph(slides, {
      width,
      height,
      fps,
      transition,
    });

    const captions = this.buildCaptions(slides, transition);
    const filters = [filter];
    let outputLabel = lastLabel;

    if (captions.length > 0) {
      const subtitlePath = join(request.workDir, "legendas.ass");
      writeFileSync(subtitlePath, buildAssSubtitles(captions, { width, height }), "utf8");
      // O caminho entra numa expressão de filtro: `\` e `:` são separadores
      // ali e quebrariam o grafo (relevante em Windows, e num caminho com
      // dois-pontos em qualquer sistema).
      const escaped = subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:");
      filters.push(`[${outputLabel}]subtitles='${escaped}'[legendado]`);
      outputLabel = "legendado";
    }

    const inputs = slides.flatMap((slide) => [
      "-loop", "1",
      "-t", slide.durationSec.toFixed(3),
      "-i", slide.imagePath,
    ]);

    const args = [
      ...inputs,
      // `-stream_loop -1` repete a música quantas vezes precisar. Sem isso, a
      // combinação `-shortest` + faixa curta cortava o VÍDEO no tamanho da
      // música: medido, um vídeo de 10,8s virava 4s com uma faixa de 4s. O
      // usuário perderia dois terços do trabalho sem entender por quê.
      // O `-t` na saída é quem define a duração final; a música sobrando é
      // descartada.
      ...(request.audioPath ? ["-stream_loop", "-1", "-i", request.audioPath] : []),
      "-filter_complex", filters.join(";"),
      "-map", `[${outputLabel}]`,
      ...(request.audioPath
        ? [
            "-map", `${slides.length}:a`,
            "-c:a", "aac", "-b:a", "192k",
            // Entra e sai suave: música que começa e corta a plena carga soa
            // amadora, que é o oposto do objetivo.
            "-af",
            `afade=t=in:st=0:d=${AUDIO_FADE_IN_SEC},` +
              `afade=t=out:st=${Math.max(0, totalDurationSec - AUDIO_FADE_OUT_SEC).toFixed(3)}:d=${AUDIO_FADE_OUT_SEC}`,
          ]
        : []),
      "-c:v", "libx264", "-crf", "18", "-preset", "medium",
      "-pix_fmt", "yuv420p",
      "-r", String(fps),
      "-t", totalDurationSec.toFixed(3),
      request.outputPath,
    ];

    await this.runFfmpeg(args, totalDurationSec * 1000, onProgress);
    return { outputPath: request.outputPath, durationSec: totalDurationSec };
  }

  /**
   * Um fluxo por imagem (enquadramento + Ken Burns), encadeados com `xfade`.
   *
   * O `offset` de cada transição é acumulado: é o instante, na linha do tempo
   * já montada, em que a próxima imagem começa a entrar.
   */
  private buildFilterGraph(
    slides: Slide[],
    options: { width: number; height: number; fps: number; transition: number },
  ): { filter: string; lastLabel: string } {
    const { width, height, fps, transition } = options;
    const big = { width: width * ZOOMPAN_SUPERSAMPLE, height: height * ZOOMPAN_SUPERSAMPLE };

    const parts = slides.map((slide, index) => {
      const frames = Math.max(1, Math.round(slide.durationSec * fps));
      // Alterna aproximar/afastar: uma sequência inteira zoomando pro mesmo
      // lado cansa e denuncia que foi automático.
      const zoomIn = index % 2 === 0;
      const zoomExpression = zoomIn
        ? `min(1+(${KEN_BURNS_ZOOM - 1})*on/${frames},${KEN_BURNS_ZOOM})`
        : `max(${KEN_BURNS_ZOOM}-(${KEN_BURNS_ZOOM - 1})*on/${frames},1)`;

      return (
        `[${index}:v]` +
        // `increase` + `crop` preenche o quadro inteiro: foto em pé numa
        // saída deitada (e vice-versa) fica sem tarja preta.
        `scale=${big.width}:${big.height}:force_original_aspect_ratio=increase,` +
        `crop=${big.width}:${big.height},setsar=1,` +
        `zoompan=z='${zoomExpression}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
        `d=${frames}:s=${width}x${height}:fps=${fps},` +
        `format=yuv420p[v${index}]`
      );
    });

    let previousLabel = "v0";
    let offset = slides[0]?.durationSec ?? 0;
    for (let index = 1; index < slides.length; index++) {
      const label = `x${index}`;
      const transitionStart = Math.max(0, offset - transition);
      parts.push(
        `[${previousLabel}][v${index}]xfade=transition=fade:duration=${transition}:offset=${transitionStart.toFixed(3)}[${label}]`,
      );
      previousLabel = label;
      offset += (slides[index]?.durationSec ?? 0) - transition;
    }

    return { filter: parts.join(";"), lastLabel: previousLabel };
  }

  /** Converte a legenda de cada slide na janela de tempo em que ele está no ar. */
  private buildCaptions(slides: Slide[], transition: number): Caption[] {
    const captions: Caption[] = [];
    let start = 0;
    for (const slide of slides) {
      if (slide.caption && slide.caption.trim().length > 0) {
        captions.push({
          text: slide.caption,
          // Entra e sai junto com a transição, pra não aparecer sobre a
          // imagem anterior nem sumir tarde sobre a seguinte.
          startSec: start + transition / 2,
          endSec: start + slide.durationSec - transition / 2,
        });
      }
      start += slide.durationSec - transition;
    }
    return captions;
  }

  /**
   * Mesma estratégia do `RenderingEngine`: `-progress pipe:1` lido linha a
   * linha durante o encode, pra reportar % real em vez de barra animada.
   */
  private runFfmpeg(
    args: string[],
    totalDurationMs: number,
    onProgress?: (progress: SlideshowProgress) => void,
  ): Promise<void> {
    const startedAt = Date.now();
    const fullArgs = ["-y", "-progress", "pipe:1", "-nostats", ...args];

    return new Promise((resolve, reject) => {
      const child = spawn(FFMPEG_PATH, fullArgs);
      let stdoutBuffer = "";
      let stderrOutput = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const match = /^out_time=(\d+):(\d+):(\d+\.\d+)$/.exec(line.trim());
          if (!match || !onProgress) continue;
          const [, hours, minutes, seconds] = match as unknown as [string, string, string, string];
          const outTimeMs = (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000;
          onProgress({
            percent: totalDurationMs > 0 ? Math.min(100, (outTimeMs / totalDurationMs) * 100) : 0,
            elapsedMs: Date.now() - startedAt,
          });
        }
      });

      child.stderr.on("data", (chunk: Buffer) => (stderrOutput += chunk.toString("utf8")));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          onProgress?.({ percent: 100, elapsedMs: Date.now() - startedAt });
          resolve();
        } else {
          reject(new Error(`ffmpeg saiu com código ${code}: ${stderrOutput.slice(-3000)}`));
        }
      });
    });
  }
}
