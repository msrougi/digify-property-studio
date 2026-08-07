import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";

export interface PdfPage {
  /** PNG real escrito em disco, pronto pra virar quadro de vídeo. */
  imagePath: string;
  width: number;
  height: number;
  /** Texto da página, já normalizado. Vazio quando a página é só imagem (PDF escaneado). */
  text: string;
}

const require = createRequire(import.meta.url);

/**
 * Fontes padrão do PDF (Helvetica, Times...) não vêm embutidas no arquivo —
 * o leitor precisa fornecê-las. Sem apontar esta pasta, o pdf.js desenha a
 * página sem o texto e ninguém avisa: sai um PNG silenciosamente errado.
 */
function standardFontsDir(): string {
  return join(require.resolve("pdfjs-dist/package.json"), "..", "standard_fonts") + "/";
}

/**
 * Converte cada página de um PDF num PNG real e extrai o texto junto.
 *
 * Usa `pdfjs-dist` (Apache 2.0, o leitor do Firefox) com `@napi-rs/canvas`
 * como superfície de desenho. Nenhuma ferramenta externa: não existe
 * `pdftoppm`/`ghostscript` no ambiente, e depender de binário instalado na
 * máquina do usuário quebraria a instalação em um clique.
 *
 * O texto vem de brinde e não é detalhe: é o material do anúncio (metragem,
 * quartos, preço) que vira legenda do vídeo sem ninguém redigitar nada.
 *
 * `targetHeight` define a resolução da rasterização — sempre a partir do
 * vetor original, então a página sai nítida no tamanho do vídeo em vez de
 * ser uma miniatura ampliada.
 */
export async function rasterizePdf(
  pdfPath: string,
  outputDir: string,
  targetHeight = 1080,
): Promise<PdfPage[]> {
  // Import dinâmico: o pdf.js é ESM puro e pesado; carregar só quando há PDF
  // de verdade evita atrasar a abertura do app.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(readFileSync(pdfPath)),
    standardFontDataUrl: standardFontsDir(),
    // Sem fonte do sistema: o desenho tem que sair igual em qualquer máquina,
    // e não é aceitável que um PDF puxe recurso de fora (o app roda offline).
    useSystemFonts: false,
  });
  const document = await loadingTask.promise;

  const pages: PdfPage[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);

    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: targetHeight / unscaled.height });
    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);

    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    // Fundo branco explícito: PDF tem fundo transparente, e transparência
    // vira preto ao virar vídeo.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const imagePath = join(outputDir, `pagina-${String(pageNumber).padStart(3, "0")}.png`);
    writeFileSync(imagePath, canvas.toBuffer("image/png"));

    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    pages.push({ imagePath, width, height, text });
  }

  // `destroy` mora na tarefa de carregamento, não no documento (o documento
  // só tem `cleanup`, que esvazia cache mas não libera o worker).
  await loadingTask.destroy();
  return pages;
}
