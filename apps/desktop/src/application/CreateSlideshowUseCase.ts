import { mkdirSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { rasterizePdf } from "../infrastructure/pdf/rasterizePdf.js";
import { SlideshowRenderer, type Slide } from "../infrastructure/render/SlideshowRenderer.js";
import type { OnStageProgress } from "./progress.js";
import { isSupportedWebUrl, type WebPageCapturer } from "./WebPageCapturer.js";

/** Formatos de saída prontos — cobrem onde corretor de fato publica. */
export const SLIDESHOW_FORMATS = {
  feed: { label: "Feed / YouTube (16:9)", width: 1920, height: 1080 },
  story: { label: "Story / Reels / TikTok (9:16)", width: 1080, height: 1920 },
  square: { label: "Post quadrado (1:1)", width: 1080, height: 1080 },
} as const;

export type SlideshowFormat = keyof typeof SLIDESHOW_FORMATS;

export interface CreateSlideshowInput {
  /**
   * Fotos, PDFs e endereços de site (http/https), na ordem em que devem
   * aparecer. Uma lista só, porque pro usuário é uma sequência só.
   */
  sources: string[];
  outputPath: string;
  format?: SlideshowFormat;
  /** Segundos por imagem. */
  slideDurationSec?: number;
  /** Música de fundo (opcional). */
  audioPath?: string;
  /**
   * Usar como legenda o texto extraído das páginas de PDF e o título das
   * páginas de site. O texto vem do próprio material — nada é inventado.
   */
  usePdfTextAsCaption?: boolean;
  /** Quantas telas capturar de cada site. Página longa vira várias fatias. */
  maxWebSlices?: number;
}

export interface CreateSlideshowResult {
  outputPath: string;
  durationSec: number;
  slideCount: number;
  /** Quantos slides vieram de página de PDF. */
  pdfPageCount: number;
  /** Quantos slides vieram de captura de site. */
  webSliceCount: number;
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".heic"]);
const DEFAULT_SLIDE_SEC = 3.5;
/** Telas capturadas por site. 3 cobre topo, fotos e detalhes sem virar novela. */
const DEFAULT_MAX_WEB_SLICES = 3;
/**
 * Largura da janela virtual na captura. 1280 é largura de desktop comum: o
 * site entrega o layout "de computador", que é o que o corretor quer mostrar
 * — em 400px viria o layout de celular, estreito e com tudo empilhado.
 */
const WEB_VIEWPORT_WIDTH = 1280;
/** Legenda maior que isto vira parede de texto em cima da foto. */
const MAX_CAPTION_CHARS = 90;

/**
 * Monta um vídeo de anúncio a partir de fotos, PDFs e sites.
 *
 * Este caminho é deliberadamente o oposto do de limpeza de vídeo: **nada é
 * gerado por IA**. É composição determinística — as mesmas entradas com os
 * mesmos parâmetros produzem sempre o mesmo vídeo, e nenhum pixel do
 * material do cliente é adivinhado. Por isso não existe aqui o risco de
 * "deformar" que assombra o inpainting.
 *
 * PDF e site entram como material de primeira classe, não como anexo: cada
 * página de PDF vira um slide, cada site é capturado e fatiado na proporção
 * do vídeo, e o texto de ambos (metragem, preço, título do anúncio) vira
 * legenda sem ninguém redigitar.
 */
export class CreateSlideshowUseCase {
  constructor(
    private readonly renderer: SlideshowRenderer,
    /** Pasta de trabalho pra páginas rasterizadas e legendas — some com a sessão. */
    private readonly workDir: string,
    /**
     * Captura de site. Opcional: sem ela, um endereço na lista vira erro
     * claro em vez de silêncio.
     */
    private readonly webCapturer?: WebPageCapturer,
  ) {}

  async execute(
    input: CreateSlideshowInput,
    onProgress?: OnStageProgress,
  ): Promise<CreateSlideshowResult> {
    if (input.sources.length === 0) {
      throw new Error("Adicione ao menos uma foto, PDF ou site para montar o vídeo.");
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
    let webSliceCount = 0;

    for (const [index, source] of input.sources.entries()) {
      // Site vem antes da checagem de arquivo: um endereço não existe no
      // disco, e testar `existsSync` nele daria "arquivo não encontrado".
      if (isSupportedWebUrl(source)) {
        if (!this.webCapturer) {
          throw new Error(
            `Não é possível capturar sites nesta janela: ${source}. Remova o endereço da lista.`,
          );
        }
        const webDir = join(this.workDir, `site-${index}`);
        mkdirSync(webDir, { recursive: true });

        const captura = await this.webCapturer.capture(source, webDir, {
          viewportWidth: WEB_VIEWPORT_WIDTH,
          sliceAspectRatio: format.width / format.height,
          maxSlices: input.maxWebSlices ?? DEFAULT_MAX_WEB_SLICES,
        });

        captura.imagePaths.forEach((imagePath, fatia) => {
          slides.push({
            imagePath,
            durationSec: duration,
            // Só a primeira fatia leva o título: repeti-lo em todas viraria
            // uma tarja fixa por vários segundos.
            ...(input.usePdfTextAsCaption && fatia === 0 && captura.title
              ? { caption: shortenCaption(captura.title) }
              : {}),
          });
        });
        webSliceCount += captura.imagePaths.length;
        emit(Math.round(((index + 1) / input.sources.length) * 100));
        continue;
      }

      const filePath = source;
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
          `Formato não suportado: ${extension || filePath}. Envie fotos (JPG, PNG), PDF ou um endereço de site (http/https).`,
        );
      }

      emit(Math.round(((index + 1) / input.sources.length) * 100));
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
      webSliceCount,
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
