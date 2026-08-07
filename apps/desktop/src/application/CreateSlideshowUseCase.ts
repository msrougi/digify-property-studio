import { mkdirSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { rasterizePdf } from "../infrastructure/pdf/rasterizePdf.js";
import { SlideshowRenderer, type Slide } from "../infrastructure/render/SlideshowRenderer.js";
import type { OnStageProgress } from "./progress.js";

/** Formatos de saída prontos — cobrem onde corretor de fato publica. */
export const SLIDESHOW_FORMATS = {
  feed: { label: "Feed / YouTube (16:9)", width: 1920, height: 1080 },
  story: { label: "Story / Reels / TikTok (9:16)", width: 1080, height: 1920 },
  square: { label: "Post quadrado (1:1)", width: 1080, height: 1080 },
} as const;

export type SlideshowFormat = keyof typeof SLIDESHOW_FORMATS;

export interface CreateSlideshowInput {
  /** Fotos (.jpg/.png/...) e/ou anúncios em PDF, na ordem em que devem aparecer. */
  filePaths: string[];
  outputPath: string;
  format?: SlideshowFormat;
  /** Segundos por imagem. */
  slideDurationSec?: number;
  /** Música de fundo (opcional). */
  audioPath?: string;
  /**
   * Usar o texto extraído das páginas de PDF como legenda. O texto vem do
   * próprio anúncio — nada é inventado.
   */
  usePdfTextAsCaption?: boolean;
}

export interface CreateSlideshowResult {
  outputPath: string;
  durationSec: number;
  slideCount: number;
  /** Quantos slides vieram de página de PDF (o resto são fotos). */
  pdfPageCount: number;
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".heic"]);
const DEFAULT_SLIDE_SEC = 3.5;
/** Legenda maior que isto vira parede de texto em cima da foto. */
const MAX_CAPTION_CHARS = 90;

/**
 * Monta um vídeo de anúncio a partir de fotos e PDFs.
 *
 * Este caminho é deliberadamente o oposto do de limpeza de vídeo: **nada é
 * gerado por IA**. É composição determinística — as mesmas entradas com os
 * mesmos parâmetros produzem sempre o mesmo vídeo, e nenhum pixel do
 * material do cliente é adivinhado. Por isso não existe aqui o risco de
 * "deformar" que assombra o inpainting.
 *
 * PDF entra como material de primeira classe, não como anexo: cada página
 * vira um slide, e o texto do anúncio (metragem, quartos, preço) vira
 * legenda sem ninguém redigitar.
 */
export class CreateSlideshowUseCase {
  constructor(
    private readonly renderer: SlideshowRenderer,
    /** Pasta de trabalho pra páginas rasterizadas e legendas — some com a sessão. */
    private readonly workDir: string,
  ) {}

  async execute(
    input: CreateSlideshowInput,
    onProgress?: OnStageProgress,
  ): Promise<CreateSlideshowResult> {
    if (input.filePaths.length === 0) {
      throw new Error("Selecione ao menos uma foto ou PDF para montar o vídeo.");
    }

    const stages = ["Preparando imagens", "Montando o vídeo"];
    let stageIndex = 0;
    const emit = (percent: number): void =>
      onProgress?.({
        stage: stages[stageIndex] as string,
        stageIndex: stageIndex + 1,
        totalStages: stages.length,
        percent,
      });

    emit(0);
    mkdirSync(this.workDir, { recursive: true });

    const format = SLIDESHOW_FORMATS[input.format ?? "feed"];
    const duration = input.slideDurationSec ?? DEFAULT_SLIDE_SEC;

    const slides: Slide[] = [];
    let pdfPageCount = 0;

    for (const [index, filePath] of input.filePaths.entries()) {
      if (!existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }
      const extension = extname(filePath).toLowerCase();

      if (extension === ".pdf") {
        // Uma pasta por PDF: dois anúncios diferentes não podem sobrescrever
        // as páginas um do outro.
        const pdfDir = join(this.workDir, `pdf-${index}`);
        mkdirSync(pdfDir, { recursive: true });
        // Rasteriza na altura da SAÍDA: a página é vetor, então sai nítida no
        // tamanho final em vez de ser uma miniatura ampliada.
        const pages = await rasterizePdf(filePath, pdfDir, format.height);
        for (const page of pages) {
          slides.push({
            imagePath: page.imagePath,
            durationSec: duration,
            ...(input.usePdfTextAsCaption ? { caption: shortenCaption(page.text) } : {}),
          });
        }
        pdfPageCount += pages.length;
      } else if (IMAGE_EXTENSIONS.has(extension)) {
        slides.push({ imagePath: filePath, durationSec: duration });
      } else {
        throw new Error(
          `Formato não suportado: ${extension || filePath}. Envie fotos (JPG, PNG) ou PDF.`,
        );
      }

      emit(Math.round(((index + 1) / input.filePaths.length) * 100));
    }

    stageIndex = 1;
    emit(0);

    const { durationSec } = await this.renderer.render(
      {
        slides,
        outputPath: input.outputPath,
        workDir: this.workDir,
        width: format.width,
        height: format.height,
        ...(input.audioPath ? { audioPath: input.audioPath } : {}),
      },
      (progress) => emit(progress.percent),
    );

    return {
      outputPath: input.outputPath,
      durationSec,
      slideCount: slides.length,
      pdfPageCount,
    };
  }
}

/**
 * Encurta o texto da página pra caber na tela.
 *
 * Uma página de anúncio tem parágrafos inteiros; jogados como legenda,
 * cobririam a foto. Corta na fronteira de palavra pra não terminar no meio
 * de um número (preço partido ao meio é pior que legenda truncada).
 */
function shortenCaption(text: string): string {
  const limpo = text.replace(/\s+/g, " ").trim();
  if (limpo.length <= MAX_CAPTION_CHARS) return limpo;
  const corte = limpo.slice(0, MAX_CAPTION_CHARS);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return (ultimoEspaco > MAX_CAPTION_CHARS * 0.6 ? corte.slice(0, ultimoEspaco) : corte) + "…";
}
