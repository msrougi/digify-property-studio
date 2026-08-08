export interface WebPageCaptureOptions {
  /** Largura da janela virtual. Define o "tamanho de tela" que a página enxerga. */
  viewportWidth: number;
  /** Proporção de cada fatia (largura/altura) — a mesma do vídeo de saída. */
  sliceAspectRatio: number;
  /** Teto de fatias. Página longa não pode virar um vídeo de 20 slides. */
  maxSlices: number;
}

export interface CapturedWebPage {
  /** PNGs em disco, na ordem de leitura (topo da página primeiro). */
  imagePaths: string[];
  /** Título da página — vira legenda, quando o usuário pede. */
  title: string;
  /** Altura total da página em px, antes do corte pelo teto de fatias. */
  fullHeight: number;
}

/**
 * Porta pra capturar uma página web como imagens.
 *
 * Existe como interface porque a implementação real precisa do
 * `BrowserWindow` do Electron, que só existe no processo main — importá-lo
 * aqui quebraria os testes de unidade, que rodam em Node puro. A
 * implementação está em `infrastructure/web/ElectronWebPageCapturer.ts`.
 */
export interface WebPageCapturer {
  capture(
    url: string,
    outputDir: string,
    options: WebPageCaptureOptions,
  ): Promise<CapturedWebPage>;
}

/**
 * Aceita só `http`/`https`.
 *
 * Não é formalidade: `file://` daria à página capturada acesso de leitura ao
 * disco do usuário, e esquemas como `javascript:` executariam código. Como a
 * URL vem digitada por quem usa o app, o filtro é a fronteira de confiança.
 */
export function isSupportedWebUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
